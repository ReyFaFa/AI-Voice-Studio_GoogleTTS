# Technical Report: Quality Issues and Resource Inefficiency in Gemini 2.5 Pro TTS

**Date:** February 28, 2026  
**Project ID:** gemini-467021  
**Target Model:** gemini-2.5-pro-preview-tts

## 1. Executive Summary

This report documents significant quality defects in the Gemini 2.5 Pro TTS model observed during the production of high-quality audiobook content. These defects resulted in a **14x increase in token consumption** compared to normal operations due to recursive retries and manual intervention. The primary issues include high-frequency artifacts, excessive silent padding, and incomplete audio generation (premature termination).

## 2. Technical Issue Analysis

### A. High-Frequency Artifacts (Squeaking/Metallic Noise)

- **Symptom:** Long-form audio generation often contains high-frequency "chirping" or metallic artifacts that degrade listener immersion.
- **Analysis:** Discrepancies between the model's internal sampling behavior and standard AudioContext configurations (44.1kHz vs 48kHz) exacerbated these artifacts.
- **Workaround:** We had to normalize the entire pipeline to 48kHz and implement custom PCM volume normalization to prevent clipping-induced noise.

### B. Excessive Silent Padding (1~2 Minutes)

- **Symptom:** The model frequently appends 60 to 120 seconds of silence at the end of a generated chunk, despite the text being fully read.
- **Impact:** This silence counts towards output token duration and significantly delays the concatenation process, leading to "RESOURCE_EXHAUSTED" (429) errors during large-scale tasks.
- **Workaround:** Implemented an aggressive `trimTrailingSilence` algorithm with a dynamic RMS threshold to strip this unnecessary overhead manually.

### C. Incomplete Audio Generation (Premature Cutoff)

- **Symptom:** The model returns a "success" status but the generated audio only covers the first 10-30% of the input text.
- **Data Proof:** In a 21-chunk task, several chunks produced only 11s or 50s of audio for text that requires 150s+ of speech.
- **Workaround:** Developed a client-side validation logic that calculates "Minimum Expected Duration" (char_count \* 0.1s) and forces an automatic retry if the result is less than 40% of the expectation.

## 3. Economic Impact & Resource Waste

- **Normal Efficiency:** ~3.9M tokens should produce approximately 40-50 hours of audio.
- **Actual Result:** Due to the issues above, 3,859,971 tokens were consumed to produce only **3 hours** of usable content.
- **Retry Rate:** Approximately 90% of requests in February required at least 3-5 retries to achieve acceptable quality.

## 4. Conclusion

The current preview state of the Gemini 2.5 Pro TTS model exhibits instability that makes commercial-grade production prohibitively expensive without manual correction. We request a credit adjustment of **111,809 KRW** to compensate for tokens wasted on defective outputs and a re-evaluation of the initial $300 credit to support further ecosystem development.

---

_Reported by the developer of the AI Voice Studio (Antigravity Integration)._
