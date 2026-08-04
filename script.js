(() => {
  "use strict";

  const qs = new URLSearchParams(window.location.search);
  const repositoryAssignments = {
    "crowdcheck-s1-control": {
      "study": 1,
      "condition": "control"
    },
    "crowdcheck-s1-public-note": {
      "study": 1,
      "condition": "public_note"
    },
    "crowdcheck-s2-control": {
      "study": 2,
      "condition": "control"
    },
    "crowdcheck-s2-public-note": {
      "study": 2,
      "condition": "public_note"
    },
    "crowdcheck-s3-control": {
      "study": 3,
      "condition": "control"
    },
    "crowdcheck-s3-few-sources": {
      "study": 3,
      "condition": "few_sources"
    },
    "crowdcheck-s3-many-sources": {
      "study": 3,
      "condition": "many_sources"
    },
    "crowdcheck-s4-control": {
      "study": 4,
      "condition": "control"
    },
    "crowdcheck-s4-community-contributors": {
      "study": 4,
      "condition": "community_contributors"
    },
    "crowdcheck-s4-senior-contributors": {
      "study": 4,
      "condition": "senior_contributors"
    }
  };
  const repositoryName = window.location.pathname.split("/").filter(Boolean)[0] || "";
  const repositoryAssignment = repositoryAssignments[repositoryName] || null;
  const defaultStudy = Number(document.body.dataset.defaultStudy || 1);
  const requestedStudy = Number(qs.get("study"));
  const study = repositoryAssignment
    ? repositoryAssignment.study
    : [1, 2, 3, 4].includes(requestedStudy)
      ? requestedStudy
      : defaultStudy;
  const fixedCondition = repositoryAssignment?.condition || null;
  const participantId = sanitizeId(qs.get("pid")) || createId("P");
  const sessionId = createId("S");
  const returnUrl = qs.get("returnUrl");
  const isDebug = qs.get("debug") === "1";

  const studyConfig = {
    1: {
      topic: "城市散步路线",
      instruction: "请让AI助手创作一段“周末城市散步路线”分享，内容应轻松、具体，适合发布在社交媒体。",
      defaultPrompt: "写一段周末城市散步路线分享，语气自然，包含路线、休息点和一个拍照建议。",
      generated: "周末想放慢脚步，可以试试这条城市散步路线：从老街口出发，沿着河边步道慢慢走，途中在街角咖啡店休息，再到城市公园看日落。全程不赶时间，穿一双舒服的鞋就好。傍晚光线柔和，桥边和树影下都很适合拍照。#周末散步 #城市生活"
    },
    2: {
      topic: "学习效率经验",
      instruction: "请让AI助手创作一段“提高学习效率”经验分享，内容应实用、自然，适合发布在社交媒体。",
      defaultPrompt: "写一段提高学习效率的经验分享，包含三个容易执行的方法，语气不要说教。",
      generated: "最近试了三个提高学习效率的小方法：第一，把任务拆成25分钟的小段；第二，开始前只保留当前需要的资料；第三，每完成一段就用一句话记录进度。重点不是把时间排满，而是减少频繁切换。坚持几天后，学习节奏会稳定很多。#学习方法 #效率提升"
    },
    3: {
      topic: "周末博物馆攻略",
      instruction: "请让AI助手创作一段“周末博物馆攻略”，内容应包含参观建议，适合发布在社交媒体。",
      defaultPrompt: "写一段周末博物馆参观攻略，包含预约、参观顺序和休息建议，语气轻松。",
      generated: "周末逛博物馆可以提前一天预约，开馆后先看最想去的常设展，再根据体力安排临展。建议每参观一个小时就休息十分钟，重点展品旁的说明可以先拍下来，回家再慢慢看。避开午后高峰，体验通常会更从容。#博物馆攻略 #周末去哪儿"
    },
    4: {
      topic: "居家收纳技巧",
      instruction: "请让AI助手创作一段“居家收纳技巧”分享，内容应简单可执行，适合发布在社交媒体。",
      defaultPrompt: "写一段居家收纳技巧，包含分类、摆放和定期整理三个建议，语气亲切。",
      generated: "居家收纳不一定要一次完成，可以从一个抽屉开始：先按使用频率分类，把每天会用的物品放在伸手可及的位置；同类物品尽量集中，避免重复购买；每月留十分钟检查一次，把不再需要的东西及时处理。空间会慢慢变得清爽。#居家整理 #收纳技巧"
    }
  };

  const conditions = {
    1: ["control", "public_note"],
    2: ["control", "public_note"],
    3: ["control", "few_sources", "many_sources"],
    4: ["control", "community_contributors", "senior_contributors"]
  };
const state = {
    participantId,
    sessionId,
    study,
    condition: null,
    eligibleForRandomization: null,
    initialDisclosure: null,
    initialDeclaration: "none",
    postDeclaration: "none",
    postRenderedAt: null,
    postEditOpened: false,
    postEditSaved: false,
    postPublicationAiDeclarationEver: false,
    correctiveDisclosure: false,
    correctiveDisclosureLatencyMs: null,
    prompt: "",
    aiDraft: "",
    finalDraft: "",
    aiCalls: 0,
    startedAt: new Date().toISOString(),
    events: [],
  };

  const $ = (id) => document.getElementById(id);
  const config = studyConfig[study];

  function sanitizeId(value) {
    if (!value) return "";
    return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  }

  function createId(prefix) {
    const bytes = new Uint32Array(2);
    crypto.getRandomValues(bytes);
    return `${prefix}-${Date.now().toString(36)}-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
  }

  function logEvent(name, detail = {}) {
    state.events.push({
      name,
      at: new Date().toISOString(),
      elapsedMs: Date.now() - new Date(state.startedAt).getTime(),
      ...detail
    });
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.toggle("active", screen.id === id);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    logEvent("screen_view", { screen: id });
  }


  function chooseCondition() {
    if (fixedCondition && conditions[study].includes(fixedCondition)) return fixedCondition;
    const requested = qs.get("condition");
    if (requested && conditions[study].includes(requested)) return requested;
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return conditions[study][bytes[0] % conditions[study].length];
  }

  function noteMetadata(condition) {
    if (condition === "few_sources") {
      return "评价信息：共有5名相互独立的社区贡献者参与评价，其中4名认为这条附注有帮助。";
    }
    if (condition === "many_sources") {
      return "评价信息：共有30名相互独立的社区贡献者参与评价，其中24名认为这条附注有帮助。";
    }
    if (condition === "community_contributors") {
      return "评价信息：共有30名社区贡献者参与评价，其中24人认为这条附注有帮助。参与评价的用户是普通社区贡献者。";
    }
    if (condition === "senior_contributors") {
      return "评价信息：共有30名社区贡献者参与评价，其中24人认为这条附注有帮助。参与评价的用户是资深核查贡献者。";
    }
    return "";
  }

  function closeDeclarationMenu() {
    $("declaration-menu").hidden = true;
    $("declaration-toggle").setAttribute("aria-expanded", "false");
  }

  function closeVisibilityMenu() {
    $("visibility-menu").hidden = true;
    $("visibility-toggle").setAttribute("aria-expanded", "false");
  }

  function closePostActionMenu() {
    $("post-action-menu").hidden = true;
    $("post-more-button").setAttribute("aria-expanded", "false");
  }

  function closeEditDeclarationMenu() {
    $("edit-declaration-menu").hidden = true;
    $("edit-declaration-toggle").setAttribute("aria-expanded", "false");
  }

  const declarationLabels = {
    none: "内容声明",
    original: "自主创作",
    repost: "内容转载",
    ai: "内容由AI生成",
    fictional: "虚构演绎"
  };

  const postLabelTexts = {
    original: "内容为自主创作",
    repost: "内容为转载",
    ai: "内容使用AI生成",
    fictional: "内容为虚构演绎"
  };

  function updateDeclarationSummary() {
    const selected = document.querySelector('input[name="content-declaration"]:checked');
    $("declaration-toggle-label").textContent = declarationLabels[selected?.value || "none"];
    $("declaration-toggle").classList.toggle("selected", selected?.value !== "none");
  }

  function updateVisibilitySummary() {
    const selected = document.querySelector('input[name="post-visibility"]:checked');
    const labels = { public: "公开", followers: "粉丝", friends: "好友圈", private: "仅自己可见", group: "群可见" };
    $("visibility-toggle-label").textContent = labels[selected?.value || "public"];
  }

  function updateEditDeclarationSummary() {
    const selected = document.querySelector('input[name="edit-content-declaration"]:checked');
    const value = selected?.value || "none";
    $("edit-declaration-toggle-label").textContent = declarationLabels[value];
    $("edit-declaration-toggle").classList.toggle("selected", value !== "none");
  }

  function renderPostDeclaration() {
    const value = state.postDeclaration || "none";
    $("ai-label").hidden = value === "none";
    if (value !== "none") $("ai-label").textContent = postLabelTexts[value] || "内容声明已更新";
  }

  function renderCommunityNote() {
    const hasNote = state.eligibleForRandomization && state.condition !== "control";
    $("community-note").hidden = !hasNote;
    if (!hasNote) return;
    const resolved = state.postDeclaration === "ai";
    $("community-note").classList.toggle("resolved", resolved);
    $("note-heading-text").textContent = resolved ? "社区附注 · 已处理" : "社区附注 · 公开";
    $("note-primary-text").textContent = resolved
      ? "作者已为该帖补充“内容使用AI生成”声明。"
      : "社区贡献者认为：该帖的文案在创作过程中使用了生成式AI，但发布者尚未添加AI内容声明。";
    $("note-secondary-text").textContent = resolved
      ? "原附注由来自不同观点群体的社区贡献者评为“有帮助”。"
      : "来自不同观点群体的贡献者已将这条附注评为“有帮助”。";
  }

  function openPostEditor() {
    closePostActionMenu();
    state.postEditOpened = true;
    $("edit-post-text").value = state.finalDraft;
    updateCount($("edit-post-text"), $("edit-post-count"), 1500);
    const current = state.postDeclaration || "none";
    const selected = document.querySelector('input[name="edit-content-declaration"][value="' + current + '"]') || $("edit-declaration-none");
    selected.checked = true;
    updateEditDeclarationSummary();
    closeEditDeclarationMenu();
    $("edit-post-modal").hidden = false;
    document.body.classList.add("modal-open");
    logEvent("post_edit_opened", { currentDeclaration: current });
    window.setTimeout(() => $("edit-post-text").focus(), 0);
  }

  function closePostEditor(reason) {
    if ($("edit-post-modal").hidden) return;
    $("edit-post-modal").hidden = true;
    document.body.classList.remove("modal-open");
    closeEditDeclarationMenu();
    if (reason !== "saved") logEvent("post_edit_closed", { reason });
  }

  function savePostEdit() {
    const updatedText = $("edit-post-text").value.trim();
    if (updatedText.length < 20) {
      $("edit-post-text").setCustomValidity("帖子正文请至少保留20个字。");
      $("edit-post-text").reportValidity();
      return;
    }
    $("edit-post-text").setCustomValidity("");
    const previousDeclaration = state.postDeclaration || "none";
    const newDeclaration = document.querySelector('input[name="edit-content-declaration"]:checked')?.value || "none";
    state.finalDraft = updatedText;
    state.postDeclaration = newDeclaration;
    state.postEditSaved = true;
    state.correctiveDisclosure = Boolean(state.eligibleForRandomization && newDeclaration === "ai");
    if (state.eligibleForRandomization && previousDeclaration !== "ai" && newDeclaration === "ai") {
      state.postPublicationAiDeclarationEver = true;
      if (state.correctiveDisclosureLatencyMs === null && state.postRenderedAt) {
        state.correctiveDisclosureLatencyMs = Date.now() - state.postRenderedAt;
      }
    }
    $("published-content").textContent = state.finalDraft;
    renderPostDeclaration();
    renderCommunityNote();
    logEvent("post_edit_saved", {
      previousDeclaration,
      newDeclaration,
      aiDeclarationAdded: previousDeclaration !== "ai" && newDeclaration === "ai",
      finalLength: updatedText.length,
      correctiveDisclosure: state.correctiveDisclosure
    });
    closePostEditor("saved");
  }

  function resetPublishSelections() {
    $("content-declaration-none").checked = true;
    $("initial-disclosure").checked = false;
    $("visibility-public").checked = true;
    updateDeclarationSummary();
    updateVisibilitySummary();
    closeDeclarationMenu();
    closeVisibilityMenu();
  }

  function setupDeclarationMenu() {
    resetPublishSelections();
    $("declaration-toggle").addEventListener("click", (event) => {
      event.stopPropagation();
      closeVisibilityMenu();
      const willOpen = $("declaration-menu").hidden;
      $("declaration-menu").hidden = !willOpen;
      $("declaration-toggle").setAttribute("aria-expanded", String(willOpen));
    });
    $("visibility-toggle").addEventListener("click", (event) => {
      event.stopPropagation();
      closeDeclarationMenu();
      const willOpen = $("visibility-menu").hidden;
      $("visibility-menu").hidden = !willOpen;
      $("visibility-toggle").setAttribute("aria-expanded", String(willOpen));
    });
    $("declaration-menu").addEventListener("click", (event) => event.stopPropagation());
    $("visibility-menu").addEventListener("click", (event) => event.stopPropagation());
    document.querySelectorAll('input[name="content-declaration"]').forEach((input) => {
      input.addEventListener("change", () => {
        updateDeclarationSummary();
        closeDeclarationMenu();
      });
    });
    document.querySelectorAll('input[name="post-visibility"]').forEach((input) => {
      input.addEventListener("change", () => {
        updateVisibilitySummary();
        closeVisibilityMenu();
      });
    });
    document.addEventListener("click", () => {
      closeDeclarationMenu();
      closeVisibilityMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDeclarationMenu();
        closeVisibilityMenu();
        closePostActionMenu();
        closePostEditor("escape");
      }
    });
    window.addEventListener("pageshow", () => {
      if ($("publish-screen").classList.contains("active")) resetPublishSelections();
    });
  }

  function displayPublishedPost() {
    state.postRenderedAt = Date.now();
    $("published-content").textContent = state.finalDraft;
    const visibilityLabels = { public: "公开", followers: "粉丝可见", friends: "好友圈可见", private: "仅自己可见", group: "群可见" };
    document.querySelector(".post-author .muted").textContent = `刚刚 · 来自网页端 · ${visibilityLabels[state.postVisibility || "public"]}`;
    renderPostDeclaration();
    renderCommunityNote();
    const metadata = noteMetadata(state.condition);
    $("note-metadata").hidden = !metadata;
    $("note-metadata").textContent = metadata;
    $("initial-discloser-exit").hidden = !state.initialDisclosure;
    $("continue-panel").hidden = Boolean(state.initialDisclosure);
    showScreen("post-screen");
    logEvent("post_rendered", {
      initialDisclosure: state.initialDisclosure,
      initialDeclaration: state.initialDeclaration,
      eligibleForRandomization: state.eligibleForRandomization,
      condition: state.condition,
      noteVisible: state.eligibleForRandomization && state.condition !== "control",
      postDeclaration: state.postDeclaration
    });
  }


  function finishExperiment(path) {
    state.correctiveDisclosure = Boolean(state.eligibleForRandomization && state.postDeclaration === "ai");
    state.finalDisclosure = state.postDeclaration === "ai";
    state.completedAt = new Date().toISOString();
    state.completionPath = path;
    state.completionCode = `WG-${study}-${sessionId.slice(-8).toUpperCase()}`;
    logEvent("experiment_complete", { path });
    const storageKey = `crowdchecking-study4-${sessionId}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {
      state.storageWarning = true;
    }
    window.parent?.postMessage({ type: "crowdchecking-study4-update", payload: state }, "*");
    window.parent?.postMessage({
      type: "crowdchecking-experiment-complete",
      payload: state
    }, "*");
    $("completion-code").textContent = `完成码：${state.completionCode}`;
    if (returnUrl) $("return-btn").hidden = false;
    showScreen("complete-screen");
  }

  function generateDraft() {
    const prompt = $("prompt-input").value.trim();
    if (prompt.length < 5) {
      $("prompt-input").focus();
      $("prompt-input").setCustomValidity("请先输入至少5个字的提示词。");
      $("prompt-input").reportValidity();
      return;
    }
    $("prompt-input").setCustomValidity("");
    state.prompt = prompt;
    state.aiCalls += 1;
    logEvent("ai_generation_requested", { call: state.aiCalls, promptLength: prompt.length });
    $("generate-btn").disabled = true;
    $("ai-working").hidden = false;
    window.setTimeout(() => {
      const lead = prompt.includes("第一人称") ? "我整理了一条适合周末实践的分享。" : "";
      state.aiDraft = `${lead}${lead ? "\n\n" : ""}${config.generated}`;
      $("draft-input").value = state.aiDraft;
      $("draft-panel").hidden = false;
      $("ai-working").hidden = true;
      $("generate-btn").disabled = false;
      updateCount($("draft-input"), $("draft-count"), 1500);
      logEvent("ai_generation_completed", { call: state.aiCalls, outputLength: state.aiDraft.length });
      $("draft-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    }, 700);
  }

  function updateCount(input, output, limit) {
    output.textContent = `${input.value.length} / ${limit}`;
  }

  $("topic-instruction").textContent = `本次主题：${config.topic}。${config.instruction}`;
  $("prompt-input").value = config.defaultPrompt;
  updateCount($("prompt-input"), $("prompt-count"), 500);
  setupDeclarationMenu();

$("consent").addEventListener("change", (event) => {
    $("start-btn").disabled = !event.target.checked;
  });
  $("start-btn").addEventListener("click", () => {
    logEvent("consent_confirmed");
    showScreen("create-screen");
  });
  $("prompt-input").addEventListener("input", () => updateCount($("prompt-input"), $("prompt-count"), 500));
  $("draft-input").addEventListener("input", () => updateCount($("draft-input"), $("draft-count"), 1500));
  $("generate-btn").addEventListener("click", generateDraft);
  $("to-publish-btn").addEventListener("click", () => {
    const finalDraft = $("draft-input").value.trim();
    if (finalDraft.length < 20) {
      $("draft-input").setCustomValidity("最终文案请至少保留20个字。");
      $("draft-input").reportValidity();
      return;
    }
    $("draft-input").setCustomValidity("");
    state.finalDraft = finalDraft;
    state.editDistanceApprox = Math.abs(state.aiDraft.length - finalDraft.length);
    logEvent("draft_confirmed", {
      finalLength: finalDraft.length,
      aiLength: state.aiDraft.length,
      approximateLengthChange: state.editDistanceApprox
    });
    $("publish-text").value = finalDraft;
    showScreen("publish-screen");
  });
  $("publish-text").addEventListener("input", (event) => {
    state.finalDraft = event.target.value;
  });
  $("publish-btn").addEventListener("click", () => {
    const finalDraft = $("publish-text").value.trim();
    if (finalDraft.length < 20) {
      $("publish-text").setCustomValidity("发布文案请至少保留20个字。");
      $("publish-text").reportValidity();
      return;
    }
    state.finalDraft = finalDraft;
    state.initialDeclaration = document.querySelector('input[name="content-declaration"]:checked')?.value || "none";
    state.initialDisclosure = state.initialDeclaration === "ai";
    state.postDeclaration = state.initialDeclaration;
    state.postVisibility = document.querySelector('input[name="post-visibility"]:checked')?.value || "public";
    state.eligibleForRandomization = !state.initialDisclosure;
    state.condition = state.eligibleForRandomization ? chooseCondition() : "initial_discloser";
    logEvent("initial_publish_submitted", {
      initialDisclosure: state.initialDisclosure,
      eligibleForRandomization: state.eligibleForRandomization,
      assignedCondition: state.condition
    });
    displayPublishedPost();
  });
  $("post-more-button").addEventListener("click", (event) => {
    event.stopPropagation();
    closeDeclarationMenu();
    closeVisibilityMenu();
    const willOpen = $("post-action-menu").hidden;
    $("post-action-menu").hidden = !willOpen;
    $("post-more-button").setAttribute("aria-expanded", String(willOpen));
  });
  $("post-action-menu").addEventListener("click", (event) => event.stopPropagation());
  $("edit-post-button").addEventListener("click", openPostEditor);
  $("edit-declaration-toggle").addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = $("edit-declaration-menu").hidden;
    $("edit-declaration-menu").hidden = !willOpen;
    $("edit-declaration-toggle").setAttribute("aria-expanded", String(willOpen));
  });
  $("edit-declaration-menu").addEventListener("click", (event) => event.stopPropagation());
  document.querySelectorAll('input[name="edit-content-declaration"]').forEach((input) => {
    input.addEventListener("change", () => {
      updateEditDeclarationSummary();
      closeEditDeclarationMenu();
    });
  });
  $("edit-post-text").addEventListener("input", () => updateCount($("edit-post-text"), $("edit-post-count"), 1500));
  $("save-edit-post").addEventListener("click", savePostEdit);
  $("cancel-edit-post").addEventListener("click", () => closePostEditor("cancel_button"));
  $("cancel-edit-post-top").addEventListener("click", () => closePostEditor("cancel_top"));
  $("edit-post-modal").addEventListener("click", (event) => {
    if (event.target === $("edit-post-modal")) closePostEditor("backdrop");
  });
  document.addEventListener("click", closePostActionMenu);
  $("initial-finish-btn").addEventListener("click", () => finishExperiment("initial_discloser"));
  $("finish-experiment-btn").addEventListener("click", () => finishExperiment("randomized_experiment"));
  $("return-btn").addEventListener("click", () => {
    const target = new URL(returnUrl);
    target.searchParams.set("completionCode", state.completionCode);
    target.searchParams.set("pid", participantId);
    target.searchParams.set("postEditOpened", state.postEditOpened ? "1" : "0");
    target.searchParams.set("postPublicationAiDeclaration", state.correctiveDisclosure ? "1" : "0");
    window.location.href = target.toString();
  });

  if (isDebug) {
    $("debug-panel").hidden = false;
    $("debug-study").value = String(study);
    $("debug-study").addEventListener("change", (event) => {
      const target = new URL(window.location.href);
      target.searchParams.set("study", event.target.value);
      target.searchParams.set("debug", "1");
      window.location.href = target.toString();
    });
    $("debug-condition").textContent = fixedCondition
      ? `固定条件：${fixedCondition}`
      : `可用条件：${conditions[study].join(" / ")}`;
  }

  logEvent("experiment_loaded", {
    study,
    participantId,
    forcedCondition: fixedCondition || qs.get("condition") || null,
    referrerPresent: Boolean(document.referrer)
  });
})();

