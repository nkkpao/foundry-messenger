Hooks.once("init", () => {
  console.log("Foundry Messenger | Инициализация настроек модуля");


  game.settings.register("foundry-messenger", "npcList", {
    name: "Список NPC",
    hint: "Введите имена NPC через запятую, которые будут доступны в мессенджере.",
    scope: "world",
    config: true,
    type: String,
    default: "NPC 1, NPC 2"
  });

  game.settings.register("foundry-messenger", "chatHistory", {
    name: "История чатов",
    hint: "Хранит историю сообщений для каждого NPC в формате JSON. Данные сохраняются между сессиями.",
    scope: "world",
    config: false,
    type: String,
    default: "{}"
  });
});

Hooks.once("ready", () => {
  console.log("Foundry Messenger модуль запущен");
  if (game.user.isGM) {
    game.socket.on("module.foundry-messenger", data => {
      if (data.action === "newMessage") {
        let chats;
        try {
          chats = JSON.parse(game.settings.get("foundry-messenger", "chatHistory") || "{}");
        } catch (e) {
          console.error("Ошибка парсинга chatHistory", e);
          chats = {};
        }
        if (!chats[data.payload.npcId]) chats[data.payload.npcId] = [];
        if (!chats[data.payload.npcId].some(msg => msg.timestamp === data.payload.timestamp && msg.text === data.payload.text)) {
          chats[data.payload.npcId].push(data.payload);
          console.log("Сохраняем историю (GM):", chats);
          game.settings.set("foundry-messenger", "chatHistory", JSON.stringify(chats));
        }
      }
    });
  }
});

Hooks.on("getSceneControlButtons", controls => {
  let tokenControls = controls.find(c => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "messenger",
      title: "Мессенджер",
      icon: "fas fa-comments",
      button: true,
      onClick: () => {
        new MessengerApp().render(true);
      }
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
      title: "Мессенджер"
    });
  }

  constructor(options = {}) {
    super(options);
    this.chats = this._loadChats();
  }

  _loadChats() {
    try {
      return JSON.parse(game.settings.get("foundry-messenger", "chatHistory") || "{}");
    } catch (e) {
      console.error("Ошибка парсинга chatHistory", e);
      return {};
    }
  }

  getData() {
    this.chats = this._loadChats();
    return {
      chats: this.getChats(),
      isGM: game.user.isGM
    };
  }

  getChats() {
    const npcList = game.settings.get("foundry-messenger", "npcList");
    const npcNames = npcList.split(",").map(n => n.trim()).filter(n => n);
    return npcNames.map(name => {
      return { id: name, name: name, messages: this.chats[name] || [] };
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

    html.find(".send-button").click(ev => {
      ev.preventDefault();
      const npcId = html.find(".chat-tabs .active").data("npc-id");
      const messageInput = html.find("input[name='message']");
      const messageText = messageInput.val().trim();
      if (messageText !== "") {
        self.sendMessage(npcId, messageText);
        messageInput.val("");
      }
    });

    game.socket.on("module.foundry-messenger", data => {
      if (data.action === "newMessage") {
        self.receiveMessage(data.payload);
      }
    });
  }

  renderChat(npcId) {
    const chat = this.getChats().find(c => c.id === npcId);
    let chatHistory = this.element.find(".chat-history");
    let htmlContent = "";
    if (chat && chat.messages) {
      chat.messages.forEach(msg => {
        htmlContent += `<div class="message"><span class="sender">${msg.sender}:</span> ${msg.text}</div>`;
      });
    }
    chatHistory.html(htmlContent);

    this.element.find(".chat-tab").removeClass("active");
    this.element.find(`.chat-tab[data-npc-id="${npcId}"]`).addClass("active");
  }

  sendMessage(npcId, text) {
    const sender = game.user.isGM ? npcId : game.user.name;
    const message = {
      npcId,
      sender,
      text,
      timestamp: Date.now()
    };

    if (!this.chats[npcId]) this.chats[npcId] = [];
    this.chats[npcId].push(message);

    if (game.user.isGM) {
      this._updatePersistentChatHistory();
    }

    game.socket.emit("module.foundry-messenger", {
      action: "newMessage",
      payload: message
    });

    this.renderChat(npcId);
  }

  receiveMessage(message) {
    if (!this.chats[message.npcId]) this.chats[message.npcId] = [];
    if (!this.chats[message.npcId].some(msg => msg.timestamp === message.timestamp && msg.text === message.text)) {
      this.chats[message.npcId].push(message);
    }

    if (game.user.isGM) {
      this._updatePersistentChatHistory();
    }

    const activeNpcId = this.element.find(".chat-tabs .active").data("npc-id");
    if (activeNpcId === message.npcId) {
      this.renderChat(message.npcId);
    }
  }

  async _updatePersistentChatHistory() {
    console.log("Обновляем историю:", this.chats);
    await game.settings.set("foundry-messenger", "chatHistory", JSON.stringify(this.chats));
  }

  async close(options) {
    if (game.user.isGM) {
      await this._updatePersistentChatHistory();
    }
    return super.close(options);
  }
}
