<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  let supported = $state(false);
  let recording = $state(false);
  let url = $state("");
  let error = $state("");
  let pending = $state(false);
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  onMount(() => {
    supported =
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
  });
  function stop() {
    if (recorder?.state === "recording") recorder.stop();
    recording = false;
    stream?.getTracks().forEach((t) => t.stop());
    clearTimeout(timer);
  }
  onDestroy(() => {
    disposed = true;
    stop();
    if (url) URL.revokeObjectURL(url);
  });
  async function record() {
    if (recording) {
      stop();
      return;
    }
    error = "";
    pending = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      if (url) URL.revokeObjectURL(url);
      url = "";
      recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (!disposed)
          url = URL.createObjectURL(
            new Blob(chunks, { type: recorder?.mimeType }),
          );
      };
      recorder.start();
      recording = true;
      timer = setTimeout(stop, 15000);
    } catch {
      stop();
      error =
        "Microphone unavailable. Check browser permission, or simply practise aloud.";
    } finally {
      pending = false;
    }
  }
</script>

<div class="recorder">
  {#if supported}<button class="btn ghost" onclick={record} disabled={pending}
      >{pending
        ? "Waiting for microphone…"
        : recording
          ? "■ Stop recording"
          : "● Record yourself"}</button
    >
    <p>
      Listen to the example, then say it yourself. Up to 15 seconds; stays on
      this device. Self-practice, not a pronunciation score.
    </p>{:else}<p>
      Listen, then repeat aloud. Recording is not available in this browser.
    </p>{/if}
  {#if url}<audio controls src={url} aria-label="Your German recording"
    ></audio>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .recorder {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--linie);
  }
  p {
    font-size: 12px;
    line-height: 1.6;
    color: var(--grau);
  }
  audio {
    width: 100%;
    margin-top: 8px;
  }
</style>
