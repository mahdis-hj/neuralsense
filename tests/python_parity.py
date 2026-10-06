"""Check the app's PSD against SciPy (the Python reference).

Run after the TypeScript tests:  python tests/python_parity.py
"""
import json
import numpy as np
from scipy import signal

d = json.load(open("tests/out/psd_fixture.json"))
x = np.array(d["x"], dtype=np.float64)
_, ref = signal.periodogram(x, fs=256, window="hann", detrend="constant", scaling="density")
app = np.array(d["power"])
err = np.max(np.abs(app - ref)) / np.max(ref)
print(f"max relative difference vs scipy: {err:.2e}")
assert err < 1e-4, "PSD does not match scipy"
print("PSD matches SciPy")
