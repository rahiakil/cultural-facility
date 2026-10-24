(function (root) {
  const URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/(?:exec|dev)$/;
  let contentSha = "";

  function recordUrl(value) {
    const text = String(value || "").trim();
    return URL_RE.test(text) ? text : "";
  }

  function failMessage(error) {
    const reason = error && error.message;
    if (reason === "access") return "Could not save—Google refused access. Set Who has access to Anyone.";
    if (reason === "timeout") return "Could not save—the record link did not answer.";
    return "Could not save—retry.";
  }

  function loadWithScript(url) {
    return new Promise((resolve, reject) => {
      const callback = `cfRecord_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const script = root.document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("timeout"));
      }, 28000);
      function cleanup() {
        clearTimeout(timer);
        delete root[callback];
        script.remove();
      }
      root[callback] = (data) => {
        cleanup();
        resolve(data);
      };
      script.onerror = () => {
        cleanup();
        reject(new Error("access"));
      };
      const join = url.includes("?") ? "&" : "?";
      script.src = `${url}${join}callback=${callback}&t=${Date.now()}`;
      root.document.head.append(script);
    });
  }

  function postWithForm(url, book) {
    return root.fetch(url, {
      method: "POST",
      mode: "no-cors",
      body: new URLSearchParams({ payload: JSON.stringify(book) }),
    });
  }

  async function commit(options, mutate) {
    const url = recordUrl(options.recordUrl);
    if (!url) return { ok: false, message: "Add the Google record link first (Admin → Sync)." };
    const load = options.load || loadWithScript;
    const post = options.post || postWithForm;
    const newId = options.newId || (() => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let book;
      let missing = false;
      try {
        book = await load(url);
      } catch (error) {
        if (error && error.message === "missing") missing = true;
        else return { ok: false, message: failMessage(error) };
      }
      if (missing) book = root.CulturalStore.seedBook();
      book = root.CulturalStore.normalizeBook(book);
      if (!book || book.schemaVersion !== 1) return { ok: false, message: "Could not save—record file was not readable." };
      const changed = mutate(book);
      if (!changed.write) {
        if (missing) return { ok: false, missing: true, message: "" };
        return { ok: true, message: changed.message, book };
      }
      const writeId = newId();
      changed.book.lastWriteId = writeId;
      try {
        await post(url, changed.book);
      } catch (error) {
        continue;
      }
      return { ok: true, message: changed.message, book: changed.book };
    }
    return { ok: false, message: "Could not save—retry." };
  }

  root.CulturalRecord = { commit, recordUrl, loadWithScript, postWithForm, contentSha: () => contentSha };
})(typeof globalThis !== "undefined" ? globalThis : this);
