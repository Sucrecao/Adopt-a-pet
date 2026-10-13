#!/usr/bin/env python3
"""Extract actual local video frames and timestamps, without approving motion."""
import argparse
from collections import Counter
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile

from PIL import Image


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def fields(text):
    return dict(re.findall(r"(?<!\S)([a-z_]+):([^\s]+)", text))


def timestamps(log):
    """Use decoder emission order, never demux packet order or sorted PTS."""
    decoded, encoded, packets = [], [], {}
    for line in log.splitlines():
        stream = re.search(r"\[vist#(\d+:\d+)/[^\]]+\]", line)
        if stream and "demuxer -> " in line:
            packet = fields(line.split("demuxer -> ", 1)[1])
            packets.setdefault(stream.group(1), []).append(packet.get("pkt_pts"))
        if stream and "decoder -> " in line:
            values = fields(line.split("decoder -> ", 1)[1])
            try:
                pts, base = int(values["pts"]), Fraction(values["time_base"])
                if base <= 0:
                    raise ValueError("nonpositive time base")
            except (KeyError, ValueError, ZeroDivisionError) as error:
                raise ValueError("A decoded frame lacks a valid integer PTS/time_base") from error
            decoded.append({"pts": pts, "time_base": str(base), "pts_seconds": str(pts * base),
                            "pts_time_reported": values.get("pts_time"), "stream_id": stream.group(1),
                            "decoder_duration": values.get("duration")})
        if "encoder <- " in line:
            values = fields(line.split("encoder <- ", 1)[1])
            if values.get("type") == "video":
                try:
                    encoded.append(Fraction(values["frame_pts"]) * Fraction(values["time_base"]))
                except (KeyError, ValueError, ZeroDivisionError) as error:
                    raise ValueError("PNG encoder timestamp is missing or invalid") from error
    if not decoded:
        raise ValueError("No FFmpeg 7.1 decoder timestamp records were found")
    stream_ids = {row["stream_id"] for row in decoded}
    if len(stream_ids) != 1:
        raise ValueError("Expected exactly one selected video stream")
    original = packets.get(next(iter(stream_ids)), [])
    if not original or any(value is None or value == "NOPTS" for value in original):
        raise ValueError("Original packet PTS are missing; decoder-estimated timestamps cannot be certified as source PTS")
    try:
        original_counts = Counter(int(value) for value in original)
    except ValueError as error:
        raise ValueError("Original packet PTS are not integers") from error
    if Counter(row["pts"] for row in decoded) - original_counts:
        raise ValueError("Decoder PTS are not accounted for by original packet PTS")
    if encoded != [Fraction(row["pts_seconds"]) for row in decoded]:
        raise ValueError("PNG encoder changed timestamp values or decoded frame order")
    return decoded


def catalogue(output, decoded):
    pictures = sorted(output.glob("frame-*.png"), key=lambda path: int(path.stem.split("-")[-1]))
    if len(pictures) != len(decoded) or [int(path.stem.split("-")[-1]) for path in pictures] != list(range(len(decoded))):
        raise ValueError("PNG count/order does not match every emitted decoder frame")
    rows, seen, previous, adjacent = [], {}, None, 0
    for index, (picture, timestamp) in enumerate(zip(pictures, decoded)):
        with Image.open(picture) as image:
            if image.mode != "RGBA":
                raise ValueError("Expected an unscaled RGBA PNG at " + picture.name)
            rgba_hash = hashlib.sha256(image.tobytes()).hexdigest()
            histogram = image.getchannel("A").histogram()
            minimum, maximum = image.getchannel("A").getextrema()
            width, height = image.size
        key = (width, height, rgba_hash)
        duplicate = seen.get(key)
        adjacent += int(key == previous)
        seen.setdefault(key, index)
        rows.append({"index": index, "file": picture.name, **timestamp, "width": width, "height": height,
                     "mode": "RGBA", "rgba_sha256": rgba_hash, "png_sha256": sha256_file(picture),
                     "png_bytes": picture.stat().st_size, "duplicate_of": duplicate,
                     "alpha": {"min": minimum, "max": maximum, "transparent_pixels": histogram[0],
                               "partial_pixels": sum(histogram[1:255]), "opaque_pixels": histogram[255]}})
        previous = key
    return rows, {"decoded_frames": len(decoded), "png_frames": len(rows), "unique_rgba_frames": len(seen),
                  "exact_duplicate_frames": len(rows) - len(seen), "adjacent_exact_duplicate_frames": adjacent,
                  "observed_pts_span_seconds": str(Fraction(decoded[-1]["pts_seconds"]) - Fraction(decoded[0]["pts_seconds"]))}


def extract(input_path, output, ffmpeg, decoder=None):
    for name, path in [("input", input_path), ("ffmpeg", ffmpeg)]:
        if not path.is_absolute():
            raise ValueError(name + " must be an absolute path")
        if not path.is_file():
            raise ValueError(name + " is not a file: " + str(path))
    input_path, ffmpeg, output = input_path.resolve(), ffmpeg.resolve(), output.resolve()
    if output.exists() and (not output.is_dir() or any(output.iterdir())):
        raise ValueError("Refusing an existing non-empty output: " + str(output))
    source_hash = sha256_file(input_path)
    version = subprocess.run([str(ffmpeg), "-version"], check=True, capture_output=True, text=True).stdout
    output.parent.mkdir(parents=True, exist_ok=True)
    # Numbered image2 output can overwrite despite -n. Decode in a private new
    # directory and rename it only onto a still absent/empty destination.
    staging = Path(tempfile.mkdtemp(prefix=".whole-video-extract-", dir=output.parent))
    command = [str(ffmpeg), "-hide_banner", "-nostdin", "-loglevel", "verbose", "-debug_ts", "-n",
               "-copyts", "-threads", "1", "-filter_threads", "1", "-noautorotate", "-protocol_whitelist", "file,pipe"]
    if decoder:
        command += ["-c:v", decoder]
    command += ["-i", str(input_path), "-map", "0:v:0", "-an", "-sn", "-dn", "-fps_mode", "passthrough",
                "-enc_time_base", "demux", "-noautoscale", "-c:v", "png", "-threads", "1", "-pix_fmt", "rgba",
                "-start_number", "0", str(staging / "frame-%06d.png")]
    record = {"schema_version": 1, "status": "extracting", "review_status": "unreviewed",
              "started_at": datetime.now(timezone.utc).isoformat(),
              "output_path": str(output), "staging_path": str(staging),
              "source": {"path": str(input_path), "sha256": source_hash, "bytes": input_path.stat().st_size},
              "tool": {"path": str(Path(__file__).resolve()), "sha256": sha256_file(Path(__file__).resolve())},
              "ffmpeg": {"path": str(ffmpeg), "sha256": sha256_file(ffmpeg), "version": version},
              "decoder_requested": decoder, "decode_command": command, "command_display": shlex.join(command),
              "timestamp_method": "FFmpeg decoder-debug_ts, checked against original demux packet PTS and PNG encoder order",
              "temporal_processing": {"fps_conversion": False, "interpolation": False, "deduplication": False,
                                      "ordering": "actual decoder emission order; no PTS sorting"},
              "frames": [], "notes": ["Exact duplicate pictures are repeat poses, not new motion.",
                                         "Extraction does not approve animal identity, anatomy, contact, continuity or source motion.",
                                         "RGBA means decoded pixels; codec/color conversion is not an assurance of pre-encoding RGB identity."]}
    error = None
    try:
        with (staging / "ffmpeg-debug-ts.log").open("x") as log_file:
            completed = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=log_file, text=True)
        if completed.returncode != 0:
            raise ValueError("ffmpeg decode failed; inspect ffmpeg-debug-ts.log")
        log = (staging / "ffmpeg-debug-ts.log").read_text(errors="replace")
        decoded = timestamps(log)
        record["frames"], record["stats"] = catalogue(staging, decoded)
        record["source"]["sha256_after_decode"] = sha256_file(input_path)
        if record["source"]["sha256_after_decode"] != source_hash:
            raise ValueError("Source file changed during extraction")
        record["source_alpha_mode_tag"] = bool(re.search(r"alpha_mode\s*:\s*1", log, re.IGNORECASE))
        if record["source_alpha_mode_tag"] and all(row["alpha"]["min"] == 255 for row in record["frames"]):
            record["notes"].append("Source advertises alpha but decoded pixels are fully opaque; alpha preservation is unconfirmed. VP9 may require --decoder libvpx-vp9.")
        record["status"] = "extracted"
    except (ValueError, OSError) as failure:
        record["status"], record["error"] = "failed", str(failure)
        error = failure
    finally:
        record["finished_at"] = datetime.now(timezone.utc).isoformat()
        with (staging / "provenance.json").open("x") as manifest:
            json.dump(record, manifest, indent=2, ensure_ascii=False)
            manifest.write("\n")
    try:
        staging.rename(output)
    except OSError as failure:
        record["status"] = "failed"
        record["error"] = "Output became occupied/unavailable; existing output is unchanged. Staged extraction retained at " + str(staging)
        (staging / "provenance.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
        raise ValueError(record["error"]) from failure
    if error:
        raise error
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Absolute original local video path")
    parser.add_argument("--output", required=True, type=Path, help="New or empty output directory; never overwrite non-empty output")
    parser.add_argument("--ffmpeg", required=True, type=Path, help="Absolute FFmpeg 7.1 executable path")
    parser.add_argument("--decoder", help="Optional input decoder, e.g. libvpx-vp9 for VP9 alpha")
    args = parser.parse_args()
    try:
        record = extract(args.input, args.output, args.ffmpeg, args.decoder)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, "extraction failed: " + str(error) + "\n")
    print(json.dumps({"output": str(args.output.resolve()), "status": record["status"],
                      "review_status": record["review_status"], "stats": record["stats"]}))


if __name__ == "__main__":
    main()
