Hooks.once("init", () => {
  console.log("Foundry Messenger | Initializing module");

  game.settings.register("foundry-messenger", "npcList", {
    name: "NPC List",
    hint: "Enter NPC names separated by commas.",
    scope: "world",
    config: true,
    type: String,
    default: "NPC 1, NPC 2",
  });
});

Hooks.once("ready", () => {
  console.log("Foundry Messenger module loaded");

  game.socket.on("module.foundry-messenger", async (data) => {
    if (data.action === "newMessage") {
      await saveMessageToJournal(data.payload.npcId, data.payload);
      const messenger = Object.values(ui.windows).find(
        (w) => w instanceof MessengerApp
      );
      if (messenger) {
        messenger.renderChat(data.payload.npcId);
      }
    }
  });
});

Hooks.on("getSceneControlButtons", (controls) => {
  let tokenControls = controls.find((c) => c.name === "token");
  if (tokenControls) {
    tokenControls.tools.push({
      name: "messenger",
      title: "Messenger",
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
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "messenger-app",
      template: "modules/foundry-messenger/templates/messenger.html",
      width: 400,
      height: 600,
      title: "Messenger",
    });
  }

  getData() {
    return {
      chats: this.getChats(),
      isGM: game.user.isGM,
    };
  }

  getChats() {
    const npcList = game.settings.get("foundry-messenger", "npcList") || "";
    return npcList
      .split(",")
      .map((n) => n.trim())
      .filter((n) => n);
  }

  activateListeners(html) {
    super.activateListeners(html);
    const self = this;

    html.find(".mes-chat-tab").click(async function () {
      const npcId = $(this).data("npc-id");
      await self.renderChat(npcId);
    });

    html.find(".mes-send-button").click(async (ev) => {
      ev.preventDefault();
      const npcId = html.find(".mes-chat-tabs .active").data("npc-id");
      const messageInput = html.find("input[name='mes-message']");
      const messageText = messageInput.val().trim();
      if (messageText !== "") {
        await self.sendMessage(npcId, messageText);
        messageInput.val("");
      }
    });
  }

  async sendMessage(npcId, text) {
    if (!npcId || text.trim() === "") return;

    const sender = game.user.isGM ? npcId : game.user.name;
    const message = { npcId, sender, text, timestamp: Date.now() };

    game.socket.emit("module.foundry-messenger", {
      action: "newMessage",
      payload: message,
    });
    await saveMessageToJournal(npcId, message);
    await this.renderChat(npcId);
  }

  async renderChat(npcId) {
    if (!npcId) return;

    const journal = await getOrCreateJournal();
    const page = journal.pages.find((p) => p.name === npcId);
    let chatHistory = this.element.find(".mes-chat-history");

    if (page) {
      chatHistory.html(page.text.content);
    } else {
      chatHistory.html(`<p>No messages with ${npcId}.</p>`);
      console.error(`Chat page for NPC ${npcId} not found in 'Droppod'.`);
    }

    this.element.find(".mes-chat-tab").removeClass("active");
    this.element
      .find(`.mes-chat-tab[data-npc-id="${npcId}"]`)
      .addClass("active");
  }
}

async function getOrCreateJournal() {
  let journal = game.journal.getName("Droppod");

  if (!journal) {
    console.log("Creating new 'Droppod' journal.");
    journal = await JournalEntry.create({
      name: "Droppod",
      pages: [],
      folder: null,
      type: "journal",
    });
  }

  return game.journal.getName("Droppod");
}

async function getOrCreateJournalPage(journal, npcId) {
  if (!npcId) {
    console.error("Error: NPC ID is empty or invalid!");
    return null;
  }

  let page = journal.pages.find((p) => p.name === npcId);

  if (!page) {
    console.log(`Creating chat page for ${npcId} in 'Droppod'.`);

    let createdPages = await journal.createEmbeddedDocuments(
      "JournalEntryPage",
      [
        {
          name: npcId,
          type: "text",
          text: { content: `<h3>Chat history with ${npcId}</h3>`, format: 1 },
        },
      ]
    );

    page = createdPages.length > 0 ? createdPages[0] : null;
  }

  if (!page) {
    console.error(`Error: Could not create page for NPC ${npcId}`);
  }

  return page;
}

async function saveMessageToJournal(npcId, message) {
  const journal = await getOrCreateJournal();
  const page = await getOrCreateJournalPage(journal, npcId);

  if (!page) {
    console.error(`Error: Chat page for ${npcId} not found!`);
    return;
  }

  console.log(`Adding message from ${message.sender} in chat with ${npcId}`);

  await page.update({
    "text.content": `${page.text.content}<br><strong>${message.sender}:</strong> ${message.text}`,
  });
}
