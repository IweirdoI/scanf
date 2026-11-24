export function installModelSettings({ getBridge, icon, status }) {
  let config;
  const host = document.createElement("div");
  host.innerHTML = `<dialog id="model-dialog" aria-label="模型设置"><form id="model-form"><div class="model-heading"><span>${icon("Sparkles")} 模型设置</span><button type="button" id="model-close" aria-label="关闭模型设置">${icon("X")}</button></div><div class="model-content"><p class="model-intro">使用自己的模型解读代码与参数，或在悬停时显示解释。</p><label>API 地址<input id="model-url" type="url" required placeholder="https://your-provider.example/v1" autocomplete="off"></label><label>模型名<input id="model-name" required placeholder="填写服务商提供的模型 ID" autocomplete="off"></label><label>API Key<input id="model-key" type="password" placeholder="填写 API Key" autocomplete="new-password"></label><p class="model-hint">Key 保存在宿主凭据存储中。更换 API 地址后请重新填写 Key；本机模型可留空。</p><label class="model-checkbox"><input id="model-hover" type="checkbox"> 悬停时自动生成解释</label><p class="model-hint">启用后，悬停位置附近的源码会发送给你配置的服务商，并可能产生调用费用。解释只显示在浮层中，不修改文件。</p><p id="model-feedback" role="status"></p></div><div class="model-actions"><button type="button" id="model-clear">清除配置</button><span></span><button type="button" id="model-test">测试连接</button><button type="submit" class="primary-button">保存设置</button></div></form></dialog>`;
  document.getElementById("app").append(host);
  const $ = (id) => document.getElementById(id),
    dialog = $("model-dialog");
  const call = async (operation, payload = {}) => {
    const bridge = getBridge();
    if (!bridge?.model)
      throw new Error(
        "此窗口暂不支持模型设置，请使用 VS Code / DSH 阅读插件。",
      );
    return bridge.model(operation, payload);
  };
  function fields() {
    return {
      baseUrl: $("model-url").value.trim(),
      model: $("model-name").value.trim(),
      apiKey: $("model-key").value,
      hoverEnabled: $("model-hover").checked,
    };
  }
  function update(value) {
    config = value;
    $("model-url").value = value.baseUrl ?? "";
    $("model-name").value = value.model ?? "";
    $("model-key").value = "";
    $("model-hover").checked = !!value.hoverEnabled;
    $("model-key").placeholder = value.hasKey
      ? "已保存，留空保留原 Key"
      : "填写 API Key（本机模型可留空）";
  }
  async function load() {
    const value = await call("get");
    if (!value || typeof value.configured !== "boolean")
      throw new Error(
        "此阅读服务尚未启用模型设置，请打开新版 VS Code / DSH 插件。",
      );
    config = value;
    return value;
  }
  const busy = (value) => {
    dialog
      .querySelectorAll("button:not(#model-close), input")
      .forEach((b) => (b.disabled = value));
  };
  async function open() {
    dialog.showModal();
    $("model-feedback").textContent = "正在读取配置…";
    busy(true);
    try {
      update(await load());
      $("model-feedback").textContent = "";
    } catch (error) {
      $("model-feedback").textContent = String(error);
    } finally {
      busy(false);
    }
  }
  $("model-close").onclick = () => {
    dialog.close();
    $("model-key").value = "";
  };
  dialog.addEventListener("close", () => {
    $("model-key").value = "";
  });
  $("model-form").onsubmit = async (event) => {
    event.preventDefault();
    busy(true);
    try {
      update(await call("save", fields()));
      $("model-feedback").textContent =
        "已保存。可以悬停源码，或点击“模型解读”。";
      status("模型设置已保存。");
    } catch (error) {
      $("model-feedback").textContent = String(error);
    } finally {
      busy(false);
    }
  };
  $("model-test").onclick = async () => {
    if (!$("model-form").reportValidity()) return;
    busy(true);
    $("model-feedback").textContent = "正在测试连接…";
    try {
      update(await call("save", fields()));
      const answer = await call("test");
      $("model-feedback").textContent = answer.text;
    } catch (error) {
      $("model-feedback").textContent = String(error);
    } finally {
      busy(false);
    }
  };
  $("model-clear").onclick = async () => {
    busy(true);
    try {
      update(await call("clear"));
      $("model-feedback").textContent = "已清除模型配置与 Key。";
    } catch (error) {
      $("model-feedback").textContent = String(error);
    } finally {
      busy(false);
    }
  };
  return {
    open,
    refresh: () => load().catch(() => {}),
    get: () => config,
    call,
  };
}
