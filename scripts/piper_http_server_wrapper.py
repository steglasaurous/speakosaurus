"""Wrap piper.http_server: cap ONNX threads and disable phoneme alignments.

Speakosaurus spawns this instead of ``python -m piper.http_server``.
Thread count comes from SPEAKMANAGER_PIPER_THREADS (0 or unset = auto).
"""

from __future__ import annotations

import os


def _thread_count() -> int:
    raw = os.environ.get("SPEAKMANAGER_PIPER_THREADS", "0").strip()
    try:
        value = int(raw)
    except ValueError:
        return 0
    return value if value > 0 else 0


def _patch_onnxruntime() -> None:
    import onnxruntime as ort

    n = _thread_count()
    if n <= 0:
        return

    OrigSession = ort.InferenceSession

    class CappedInferenceSession(OrigSession):
        def __init__(self, *args, **kwargs):
            opts = kwargs.get("sess_options")
            if opts is None:
                opts = ort.SessionOptions()
            opts.intra_op_num_threads = n
            opts.inter_op_num_threads = 1
            kwargs["sess_options"] = opts
            super().__init__(*args, **kwargs)

    ort.InferenceSession = CappedInferenceSession


def _patch_piper_voice() -> None:
    from piper.voice import PiperVoice

    orig_load = PiperVoice.load

    def load(*args, **kwargs):
        kwargs["include_alignments"] = False
        return orig_load(*args, **kwargs)

    PiperVoice.load = staticmethod(load)

    orig_synthesize = PiperVoice.synthesize

    def synthesize(self, text, syn_config=None, include_alignments=False):
        return orig_synthesize(self, text, syn_config, include_alignments=False)

    PiperVoice.synthesize = synthesize


def main() -> None:
    _patch_onnxruntime()
    _patch_piper_voice()
    from piper.http_server import main as piper_main

    piper_main()


if __name__ == "__main__":
    main()
