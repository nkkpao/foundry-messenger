Hooks.once("init", () => {
  console.log("Foundry Messenger | Инициализация модуля");

  game.settings.register("foundry-messenger", "npcList", {
    name: "Список NPC",
    hint: "Введите имена NPC через запятую, которые будут доступны в мессенджере.",
    scope: "world",
    config: true,
    type: String,
    default: "NPC 1, NPC 2",
  });
});

Hooks.once("ready", () => {
  console.log("Foundry Messenger модуль запущен");

  game.socket.on("module.foundry-messenger", (data) => {
    if (data.action === "newMessage") {
      const message = data.payload;
      const npcId = message.npcId;
      saveMessageToJournal(npcId, message);
    }
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  let tokenControls = controls.find((c) => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "messenger",
      title: "Мессенджер",
      icon: "fas fa-comments",
      button: true,
      onClick: () => {
        new MessengerApp().render(true);
      },
    });
  }
});

class MessengerApp extends Application {
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "messenger-app",
      template: "modules/foundry-messenger/templates/messenger.html",
      width: 400,
      height: 600,
      title: "Мессенджер",
    });
  }

  constructor(options = {}) {
    super(options);
  }

  getData() {
    return {
      chats: this.getChats(),
      isGM: game.user.isGM,
    };
  }

  getChats() {
    const npcList = game.settings.get("foundry-messenger", "npcList");
    const npcNames = npcList
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n);
    return npcNames.map((name) => {
      return { id: name, name: name };
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    const self = this;

    const firstNpc = html.find(".chat-tab").first().data("npc-id");
    if (firstNpc) self.renderChat(firstNpc);

    html.find(".chat-tab").click(function () {
      const npcId = $(this).data("npc-id");
      self.renderChat(npcId);
    });

    html.find(".send-button").click((ev) => {
      ev.preventDefault();
      const npcId = html.find(".chat-tabs .active").data("npc-id");
      const messageInput = html.find("input[name='message']");
      const messageText = messageInput.val().trim();
      if (messageText !== "") {
        self.sendMessage(npcId, messageText);
        messageInput.val("");
      }
    });
  }

  sendMessage(npcId, text) {
    const sender = game.user.isGM ? npcId : game.user.name;
    const message = {
      npcId,
      sender,
      text,
      timestamp: Date.now(),
    };

    game.socket.emit("module.foundry-messenger", {
      action: "newMessage",
      payload: message,
    });

    saveMessageToJournal(npcId, message);

    this.renderChat(npcId);
  }

  renderChat(npcId) {
    const journal = game.journal.getName(npcId); 
    if (journal) {
      let chatHistory = this.element.find(".chat-history");
      chatHistory.html(journal.data.content); 
    }

    this.element.find(".chat-tab").removeClass("active");
    this.element.find(`.chat-tab[data-npc-id="${npcId}"]`).addClass("active");
  }
}

async function saveMessageToJournal(npcId, message) {
  let journal = game.journal.getName(npcId); 
  if (!journal) {
    journal = await JournalEntry.create({
      name: npcId,
      content: `<h3>${npcId}</h3><p><strong>${message.sender}:</strong> ${message.text}</p>`,
      folder: null, 
    });
  } else {
    await journal.update({
      content: `${journal.data.content}<br><strong>${message.sender}:</strong> ${message.text}`,
    });
  }
}
