"""Tiny non-animal lossless fixtures; no provider calls or FPS conversion."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "scripts" / "extract-whole-video-frames.py"
DEFAULT_FFMPEG = "/private/tmp/pawpal-flow-venv/lib/python3.9/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1"
FFMPEG = Path(os.environ.get("PAWPAL_FFMPEG", DEFAULT_FFMPEG)).resolve()
PTS = [100, 220, 490, 570]


def fixture(directory, codec="ffv1"):
    """Four emitted pictures with 120/270/80ms gaps; frame 2 repeats 1."""
    pictures = []
    for index, block_x in enumerate([2, 8, 8, 14]):
        picture = Image.new("RGBA", (24, 16), (0, 0, 0, 255))
        for x in range(5):
            for y in range(5):
                picture.putpixel((x, y), (0, 0, 0, 0))
                picture.putpixel((x + 5, y), (0, 0, 0, 128))
        for x in range(block_x, block_x + 4):
            for y in range(7, 11):
                picture.putpixel((x, y), (255, 255, 255, 255))
        picture.save(directory / ("source-%03d.png" % index))
        pictures.append(picture)
    video = directory / ("non-animal-four-frame.webm" if codec == "libvpx-vp9" else "non-animal-four-frame.mkv")
    command = [str(FFMPEG), "-hide_banner", "-nostdin", "-loglevel", "error", "-n",
               "-threads", "1", "-filter_threads", "1", "-framerate", "1000", "-i", str(directory / "source-%03d.png"),
               "-vf", "settb=1/1000,setpts='if(eq(N,0),100,if(eq(N,1),220,if(eq(N,2),490,570)))'",
               "-fps_mode", "passthrough", "-enc_time_base", "1/1000", "-c:v", codec, "-threads", "1"]
    if codec == "libvpx-vp9":
        command += ["-lossless", "1", "-pix_fmt", "yuva420p"]
    else:
        command += ["-pix_fmt", "bgra"]
    command += [str(video)]
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)
    return video, pictures, command


@unittest.skipUnless(FFMPEG.is_file(), "Set PAWPAL_FFMPEG to an ffmpeg 7.1 binary")
class VideoExtractionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pawpal-exact-video-test-")
        self.directory = Path(self.temporary.name).resolve()
        self.video, self.pictures, self.encode_command = fixture(self.directory)

    def tearDown(self):
        self.temporary.cleanup()

    def run_tool(self, output, *extra, video=None):
        return subprocess.run([sys.executable, str(TOOL), "--input", str(video or self.video),
                               "--output", str(output), "--ffmpeg", str(FFMPEG), *extra],
                              capture_output=True, text=True, timeout=30)

    def test_each_decoded_picture_retains_original_pts_alpha_and_duplicates(self):
        output = self.directory / "decoded"
        completed = self.run_tool(output)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        record = json.loads((output / "provenance.json").read_text())
        frames = record["frames"]
        self.assertEqual(len(frames), 4)
        self.assertEqual([row["index"] for row in frames], [0, 1, 2, 3])
        self.assertEqual([row["pts"] for row in frames], PTS)
        self.assertEqual([row["time_base"] for row in frames], ["1/1000"] * 4)
        self.assertEqual([row["pts_seconds"] for row in frames], ["1/10", "11/50", "49/100", "57/100"])
        self.assertEqual(len(list(output.glob("frame-*.png"))), 4, "A repeated picture remains a real source frame")
        for row, expected in zip(frames, self.pictures):
            with Image.open(output / row["file"]) as decoded:
                self.assertEqual(decoded.mode, "RGBA")
                self.assertEqual(decoded.size, (24, 16))
                self.assertEqual(decoded.tobytes(), expected.tobytes())
            self.assertEqual(row["rgba_sha256"], hashlib.sha256(expected.tobytes()).hexdigest())
            self.assertEqual(row["alpha"], {"min": 0, "max": 255, "transparent_pixels": 25,
                                           "partial_pixels": 25, "opaque_pixels": 334})
        self.assertEqual([row["duplicate_of"] for row in frames], [None, None, 1, None])
        self.assertEqual(record["stats"]["unique_rgba_frames"], 3)
        self.assertEqual(record["stats"]["exact_duplicate_frames"], 1)
        self.assertEqual(record["stats"]["adjacent_exact_duplicate_frames"], 1)
        self.assertEqual(record["review_status"], "unreviewed")
        self.assertIn("not new motion", " ".join(record["notes"]))
        self.assertEqual(record["source"]["sha256"], hashlib.sha256(self.video.read_bytes()).hexdigest())
        self.assertEqual(record["decode_command"][0], str(FFMPEG))
        self.assertIn("-copyts", record["decode_command"])
        self.assertIn("passthrough", record["decode_command"])
        self.assertNotIn("-r", record["decode_command"])
        self.assertTrue((output / "ffmpeg-debug-ts.log").is_file())

    def test_nonempty_output_is_rejected_without_touching_existing_bytes(self):
        output = self.directory / "existing"
        output.mkdir()
        sentinel = output / "keep.txt"
        sentinel.write_bytes(b"keep exact bytes\x00\xff")
        completed = self.run_tool(output)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("non-empty", completed.stderr)
        self.assertEqual(sentinel.read_bytes(), b"keep exact bytes\x00\xff")
        self.assertEqual(sorted(path.name for path in output.iterdir()), ["keep.txt"])

    def test_writer_arriving_during_decode_cannot_have_its_numbered_png_overwritten(self):
        output = self.directory / "writer-race"
        output.mkdir()
        sentinel = output / "frame-000000.png"
        wrapper = self.directory / "ffmpeg-with-independent-writer"
        wrapper.write_text("#!" + sys.executable + "\nimport os,sys\nfrom pathlib import Path\n"
                           "if '-i' in sys.argv:\n    Path(" + repr(str(sentinel)) + ").write_bytes(b'independent existing bytes')\n"
                           "os.execv(" + repr(str(FFMPEG)) + ", [" + repr(str(FFMPEG)) + "] + sys.argv[1:])\n")
        wrapper.chmod(0o755)
        completed = subprocess.run([sys.executable, str(TOOL), "--input", str(self.video), "--output", str(output),
                                    "--ffmpeg", str(wrapper)], capture_output=True, text=True, timeout=30)
        self.assertNotEqual(completed.returncode, 0, "A concurrently occupied output must not be replaced")
        self.assertEqual(sentinel.read_bytes(), b"independent existing bytes")
        self.assertEqual(sorted(path.name for path in output.iterdir()), ["frame-000000.png"])

    def test_empty_output_directory_is_allowed(self):
        output = self.directory / "empty"
        output.mkdir()
        completed = self.run_tool(output)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(len(list(output.glob("frame-*.png"))), 4)

    def test_input_and_ffmpeg_must_be_absolute(self):
        output = self.directory / "relative-input-rejected"
        completed = subprocess.run([sys.executable, str(TOOL), "--input", "source.mkv", "--output", str(output),
                                    "--ffmpeg", str(FFMPEG)], capture_output=True, text=True)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("absolute", completed.stderr)
        self.assertFalse(output.exists())
        completed = subprocess.run([sys.executable, str(TOOL), "--input", str(self.video), "--output", str(output),
                                    "--ffmpeg", "ffmpeg"], capture_output=True, text=True)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("absolute", completed.stderr)
        self.assertFalse(output.exists())

    def test_decode_failure_keeps_unreviewed_provenance_and_source_bytes(self):
        invalid = self.directory / "invalid-video.bin"
        invalid.write_bytes(b"not a media stream\x00\xff")
        output = self.directory / "failed-decode"
        completed = self.run_tool(output, video=invalid)
        self.assertNotEqual(completed.returncode, 0)
        record = json.loads((output / "provenance.json").read_text())
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["review_status"], "unreviewed")
        self.assertEqual(record["source"]["sha256"], hashlib.sha256(invalid.read_bytes()).hexdigest())
        self.assertEqual(invalid.read_bytes(), b"not a media stream\x00\xff")
        self.assertTrue((output / "ffmpeg-debug-ts.log").is_file())

    def test_explicit_libvpx_decoder_preserves_webm_alpha_and_source_pts(self):
        vp9_directory = self.directory / "vp9"
        vp9_directory.mkdir()
        video, pictures, _ = fixture(vp9_directory, "libvpx-vp9")
        output = self.directory / "vp9-decoded"
        completed = self.run_tool(output, "--decoder", "libvpx-vp9", video=video)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        record = json.loads((output / "provenance.json").read_text())
        self.assertEqual([row["pts"] for row in record["frames"]], PTS)
        self.assertEqual(len(record["frames"]), 4)
        self.assertEqual(record["decoder_requested"], "libvpx-vp9")
        self.assertLess(record["decode_command"].index("libvpx-vp9"), record["decode_command"].index("-i"))
        # VP9's alpha encode can round 128 to129 even with lossless1. Check the
        # video's real decoder output independently, not pre-encoding PNGs.
        reference = subprocess.run([str(FFMPEG), "-hide_banner", "-nostdin", "-loglevel", "error", "-threads", "1",
                                    "-filter_threads", "1", "-c:v", "libvpx-vp9", "-i", str(video), "-map", "0:v:0",
                                    "-fps_mode", "passthrough", "-threads", "1", "-pix_fmt", "rgba", "-f", "rawvideo", "pipe:1"],
                                   check=True, capture_output=True, timeout=30).stdout
        frame_bytes = 24 * 16 * 4
        self.assertEqual(len(reference), frame_bytes * 4)
        for index, (row, expected) in enumerate(zip(record["frames"], pictures)):
            with Image.open(output / row["file"]) as decoded:
                self.assertEqual(decoded.tobytes(), reference[index * frame_bytes:(index + 1) * frame_bytes])
                self.assertEqual(decoded.getchannel("A").histogram()[0], 25)
                self.assertEqual(sum(decoded.getchannel("A").histogram()[1:255]), 25)
        self.assertEqual(record["stats"]["exact_duplicate_frames"], 1)

    def test_timestamp_less_bitstream_is_rejected_instead_of_labeling_inferred_pts_original(self):
        raw_video = self.directory / "no-original-pts.h264"
        subprocess.run([str(FFMPEG), "-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-threads", "1",
                        "-filter_threads", "1", "-i", str(self.video), "-map", "0:v:0", "-fps_mode", "passthrough",
                        "-c:v", "libx264", "-preset", "ultrafast", "-qp", "0", "-bf", "0", "-threads", "1",
                        "-pix_fmt", "yuv420p", "-f", "h264", str(raw_video)], check=True, capture_output=True, timeout=30)
        output = self.directory / "no-pts-rejected"
        completed = self.run_tool(output, video=raw_video)
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("Original packet PTS are missing", completed.stderr)
        record = json.loads((output / "provenance.json").read_text())
        self.assertEqual(record["status"], "failed")
        self.assertEqual(record["review_status"], "unreviewed")
        self.assertTrue((output / "ffmpeg-debug-ts.log").is_file())

    def test_b_frames_follow_decoder_order_rather_than_reordered_packet_pts(self):
        video = self.directory / "b-frame-order.mp4"
        subprocess.run([str(FFMPEG), "-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-copyts", "-threads", "1",
                        "-filter_threads", "1", "-i", str(self.video), "-map", "0:v:0", "-fps_mode", "passthrough",
                        "-enc_time_base", "1/1000", "-c:v", "libx264", "-preset", "medium", "-qp", "18", "-bf", "2",
                        "-x264-params", "b-adapt=0:scenecut=0:keyint=250", "-threads", "1", "-pix_fmt", "yuv420p",
                        "-video_track_timescale", "1000", str(video)], check=True, capture_output=True, timeout=30)
        output = self.directory / "b-frame-decoded"
        completed = self.run_tool(output, video=video)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        record = json.loads((output / "provenance.json").read_text())
        self.assertEqual([row["pts"] for row in record["frames"]], PTS)
        packet_pts = [int(match.group(1)) for line in (output / "ffmpeg-debug-ts.log").read_text().splitlines()
                      if "demuxer -> " in line for match in [re.search(r"\bpkt_pts:(-?\d+)", line)] if match]
        self.assertNotEqual(packet_pts, PTS, "The fixture must genuinely exercise packet reordering")
        self.assertEqual(sorted(packet_pts), PTS)


if __name__ == "__main__":
    unittest.main()
