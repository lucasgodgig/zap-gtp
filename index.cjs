"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_wppconnect = __toESM(require("@wppconnect-team/wppconnect"), 1);
var import_dotenv3 = __toESM(require("dotenv"), 1);

// src/service/openai.ts
var import_openai = __toESM(require("openai"), 1);
var import_dotenv = __toESM(require("dotenv"), 1);
import_dotenv.default.config();
var assistant;
var openai;
var activeChats = /* @__PURE__ */ new Map();
async function initializeNewAIChatSession(chatId) {
  openai = new import_openai.default({
    apiKey: process.env.OPENAI_KEY
  });
  assistant = await openai.beta.assistants.retrieve(
    process.env.OPENAI_ASSISTANT
  );
  if (activeChats.has(chatId))
    return;
  const thread = await openai.beta.threads.create();
  activeChats.set(chatId, thread);
  setTimeout(
    () => {
      if (activeChats.has(chatId)) {
        activeChats.delete(chatId);
        console.log(`Chat ${chatId} expirou e foi removido.`);
      }
    },
    Number(process.env.HORAS_PARA_REATIVAR_IA) * 60 * 60 * 1e3
  );
}
async function mainOpenAI({
  currentMessage,
  chatId
}) {
  const thread = activeChats.get(chatId);
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: currentMessage
  });
  const run = await openai.beta.threads.runs.create(thread.id, {
    assistant_id: assistant.id,
    instructions: assistant.instructions
  });
  const messages = await checkRunStatus({ threadId: thread.id, runId: run.id });
  const responseAI = messages.data[0].content[0];
  return responseAI.text.value;
}
async function checkRunStatus({
  threadId,
  runId
}) {
  return await new Promise((resolve, _reject) => {
    const verify = async () => {
      const runStatus = await openai.beta.threads.runs.retrieve(
        threadId,
        runId
      );
      if (runStatus.status === "completed") {
        const messages = await openai.beta.threads.messages.list(threadId);
        resolve(messages);
      } else {
        console.log("Aguardando resposta da OpenAI...");
        setTimeout(verify, 3e3);
      }
    };
    verify();
  });
}

// src/util/index.ts
var allLastMessagesMap = /* @__PURE__ */ new Map();
function splitMessages(text) {
  const complexPattern = /(http[s]?:\/\/[^\s]+)|(www\.[^\s]+)|([^\s]+@[^\s]+\.[^\s]+)|(["'].*?["'])|(\b\d+\.\s)|(\w+\.\w+)/g;
  const placeholders = text.match(complexPattern) ?? [];
  const placeholder = "PLACEHOLDER_";
  let currentIndex = 0;
  const textWithPlaceholders = text.replace(
    complexPattern,
    () => `${placeholder}${currentIndex++}`
  );
  const splitPattern = /(?<!\b\d+\.\s)(?<!\w+\.\w+)[^.?!]+(?:[.?!]+["']?|$)/g;
  let parts = textWithPlaceholders.match(splitPattern) ?? [];
  if (placeholders.length > 0) {
    parts = parts.map(
      (part) => placeholders.reduce(
        (acc, val, idx) => acc.replace(`${placeholder}${idx}`, val),
        part
      )
    );
  }
  return parts;
}
async function delay(time) {
  return await new Promise((resolve) => setTimeout(resolve, time));
}
async function sendMessagesWithDelay({
  messages,
  client,
  targetNumber,
  activeChatsHistory: activeChatsHistory2,
  currentMessage,
  excludedNumbersIntervention: excludedNumbersIntervention2
}) {
  for (const [index, msg] of messages.entries()) {
    await delay(1e3);
    const lastMessages = await client.getMessages(targetNumber, {
      count: 5,
      direction: "before",
      fromMe: true
    });
    console.log(
      "lastMessages",
      lastMessages.map((c) => c.body)
    );
    if (!allLastMessagesMap.has(targetNumber)) {
      console.log("criando novo map");
      allLastMessagesMap.set(targetNumber, []);
    }
    let currentLastMessages = allLastMessagesMap.get(targetNumber);
    console.log({ currentLastMessages });
    const newMessages = lastMessages.filter(
      (message) => !currentLastMessages.some((m) => m.id === message.id)
    );
    console.log({ newMessages });
    currentLastMessages = [...newMessages, ...currentLastMessages].sort((a, b) => a.timestamp - b.timestamp).slice(0, 50);
    allLastMessagesMap.set(targetNumber, currentLastMessages);
    console.log({ currentLastMessages });
    const isMissingMessage = await isMissingMessages({
      activeChatsHistory: activeChatsHistory2,
      chatId: targetNumber,
      lastMessages: currentLastMessages
    });
    if (isMissingMessage) {
      console.log(
        "H\xE1 mensagens enviadas por humanos na conversa, parando automa\xE7\xE3o..."
      );
      excludedNumbersIntervention2.set(targetNumber, true);
      setTimeout(
        () => {
          if (excludedNumbersIntervention2.has(targetNumber)) {
            excludedNumbersIntervention2.delete(targetNumber);
          }
        },
        Number(process.env.HORAS_PARA_REATIVAR_IA) * 60 * 60 * 1e3
      );
      return;
    }
    await client.startTyping(targetNumber);
    const dynamicDelay = msg.length * 100;
    await new Promise((resolve) => setTimeout(resolve, dynamicDelay));
    client.sendText(targetNumber, msg.trimStart().trimEnd()).then(async (result) => {
      console.log("Mensagem enviada:", result.body);
      if (activeChatsHistory2.has(targetNumber)) {
        const currentHistory = activeChatsHistory2.get(targetNumber);
        if (index === messages.length - 1) {
          activeChatsHistory2.set(targetNumber, [
            ...currentHistory,
            {
              role: "user",
              parts: currentMessage
            },
            {
              role: "model",
              parts: msg.trimStart().trimEnd()
            }
          ]);
        } else {
          activeChatsHistory2.set(targetNumber, [
            ...currentHistory,
            {
              role: "model",
              parts: msg.trimStart().trimEnd()
            }
          ]);
        }
      } else {
        activeChatsHistory2.set(targetNumber, [
          {
            role: "user",
            parts: currentMessage
          },
          {
            role: "model",
            parts: msg.trimStart().trimEnd()
          }
        ]);
        setTimeout(
          () => {
            if (activeChatsHistory2.has(targetNumber)) {
              activeChatsHistory2.delete(targetNumber);
              console.log(`A IA voltar\xE1 a responder: ${targetNumber}.`);
            }
          },
          Number(process.env.HORAS_PARA_REATIVAR_IA) * 60 * 60 * 1e3
        );
      }
      await client.stopTyping(targetNumber);
    }).catch((erro) => {
      console.error("Erro ao enviar mensagem:", erro);
    });
  }
}
function formatPhoneNumber(phoneNumber) {
  let cleanNumber = phoneNumber.replace(/\D/g, "");
  if (cleanNumber.length === 13 && cleanNumber.startsWith("55")) {
    cleanNumber = cleanNumber.slice(0, 4) + cleanNumber.slice(5);
  }
  return `${cleanNumber}@c.us`;
}
async function isMissingMessages({
  chatId,
  activeChatsHistory: activeChatsHistory2,
  lastMessages
}) {
  const currentHistory = activeChatsHistory2.get(chatId);
  if (!currentHistory || currentHistory.length === 0) {
    return false;
  }
  const firstFromMeInHistory = currentHistory.filter((msg) => msg.role === "model").shift();
  console.log({ firstFromMeInHistory });
  if (!firstFromMeInHistory) {
    return false;
  }
  const indexInLastMessages = lastMessages.findLastIndex(
    (message) => (
      // @ts-expect-error
      message.body === firstFromMeInHistory.parts && message.fromMe
    )
  );
  if (indexInLastMessages === -1) {
    return false;
  }
  const isAnyMessageFromHuman = lastMessages.slice(indexInLastMessages).filter((message) => message.fromMe).find((message) => {
    const messageWasCorrect = currentHistory.filter((c) => c.role === "model").find((msg) => {
      return msg.parts === message.body;
    });
    if (messageWasCorrect)
      return false;
    return true;
  });
  return !!isAnyMessageFromHuman;
}

// src/service/google.ts
var import_generative_ai = require("@google/generative-ai");
var import_dotenv2 = __toESM(require("dotenv"), 1);
import_dotenv2.default.config();
var genAI = new import_generative_ai.GoogleGenerativeAI(process.env.GEMINI_KEY);
var model = genAI.getGenerativeModel({ model: "gemini-pro" });
var activeChats2 = /* @__PURE__ */ new Map();
var getOrCreateChatSession = async (chatId) => {
  if (activeChats2.has(chatId)) {
    const currentHistory = activeChats2.get(chatId);
    return model.startChat({
      history: currentHistory
    });
  }
  const history = [
    {
      role: "user",
      parts: process.env.GEMINI_PROMPT ?? "oi"
    },
    {
      role: "model",
      parts: "Ol\xE1, certo!"
    }
  ];
  activeChats2.set(chatId, history);
  setTimeout(
    () => {
      if (activeChats2.has(chatId)) {
        activeChats2.delete(chatId);
        console.log(`Chat ${chatId} expirou e foi removido.`);
      }
    },
    Number(process.env.HORAS_PARA_REATIVAR_IA) * 60 * 60 * 1e3
  );
  return model.startChat({
    history
  });
};
var mainGoogle = async ({
  currentMessage,
  chatId
}) => {
  const chat = await getOrCreateChatSession(chatId);
  const prompt = currentMessage;
  const result = await chat.sendMessage(prompt);
  const response = result.response;
  console.log({ response });
  const text = response.text();
  console.log({ text });
  activeChats2.set(chatId, [
    ...activeChats2.get(chatId),
    {
      role: "user",
      parts: prompt
    },
    {
      role: "model",
      parts: text
    }
  ]);
  console.log("Resposta Gemini: ", text);
  return text;
};

// src/index.ts
import_dotenv3.default.config();
var messageBufferPerChatId = /* @__PURE__ */ new Map();
var messageTimeouts = /* @__PURE__ */ new Map();
var lastMessageTimestamps = /* @__PURE__ */ new Map();
var messageCountPerChatId = /* @__PURE__ */ new Map();
var AI_SELECTED = process.env.AI_SELECTED || "GEMINI";
var MAX_RETRIES = 3;
var activeChatsHistory = /* @__PURE__ */ new Map();
var allowedNumbers = process.env.SOMENTE_RESPONDER ? process.env.SOMENTE_RESPONDER.split(",") : [];
var excludedNumbers = process.env.NAO_RESPONDER ? process.env.NAO_RESPONDER.split(",") : [];
var allowedNumbersFormatted = allowedNumbers.map(formatPhoneNumber);
var excludedNumbersFormatted = excludedNumbers.map(formatPhoneNumber);
var excludedNumbersIntervention = /* @__PURE__ */ new Map();
if (AI_SELECTED === "GEMINI" && !process.env.GEMINI_KEY) {
  throw Error(
    "Voc\xEA precisa colocar uma key do Gemini no .env! Crie uma gratuitamente em https://aistudio.google.com/app/apikey?hl=pt-br"
  );
}
if (AI_SELECTED === "GPT" && (!process.env.OPENAI_KEY || !process.env.OPENAI_ASSISTANT)) {
  throw Error(
    "Para utilizar o GPT voc\xEA precisa colocar no .env a sua key da openai e o id do seu assistante."
  );
}
import_wppconnect.default.create({
  session: "sessionName",
  catchQR: (base64Qrimg, asciiQR, attempts, urlCode) => {
    console.log("Terminal qrcode: ", asciiQR);
  },
  statusFind: (statusSession, session) => {
    console.log("Status Session: ", statusSession);
    console.log("Session name: ", session);
  },
  headless: "new"
}).then((client) => {
  start(client);
}).catch((erro) => {
  console.log(erro);
});
async function start(client) {
  client.onMessage((message) => {
    (async () => {
      if (!message.isGroupMsg && message.chatId !== "status@broadcast") {
        const chatId = message.chatId;
        if (excludedNumbersIntervention.has(chatId)) {
          return;
        }
        if (excludedNumbersFormatted.includes(chatId)) {
          console.log(
            `N\xFAmero ${chatId} est\xE1 na lista de exclu\xEDdos. Ignorando mensagem.`
          );
          return;
        }
        if (allowedNumbersFormatted.length > 0 && !allowedNumbersFormatted.includes(chatId)) {
          console.log(
            `N\xFAmero ${chatId} n\xE3o est\xE1 na lista de permitidos. Ignorando mensagem.`
          );
          return;
        }
        const currentHistory = activeChatsHistory.get(chatId);
        if (currentHistory) {
          const lastMessages = await client.getMessages(chatId, {
            count: 20,
            direction: "before",
            fromMe: true
          });
          const missingMessages = await isMissingMessages({
            chatId,
            activeChatsHistory,
            lastMessages
          });
          if (missingMessages) {
            console.log(
              `H\xE1 mensagens enviadas por humanos na conversa, parando automa\xE7\xE3o para ${chatId}...`
            );
            excludedNumbersIntervention.set(chatId, true);
            setTimeout(
              () => {
                if (excludedNumbersIntervention.has(chatId)) {
                  excludedNumbersIntervention.delete(chatId);
                }
              },
              Number(process.env.HORAS_PARA_REATIVAR_IA) * 60 * 60 * 1e3
            );
            return;
          }
        }
        if (message.type === "image") {
          client.sendText(
            message.from,
            process.env.MENSAGEM_PARA_ENVIAR_QUANDO_RECEBER_IMAGEM
          );
          return;
        }
        if (message.type === "ptt" || message.type === "audio") {
          client.sendText(
            message.from,
            process.env.MENSAGEM_PARA_ENVIAR_QUANDO_RECEBER_AUDIO
          );
          return;
        }
        if (message.type === "document" || message.type === "location") {
          client.sendText(
            message.from,
            process.env.MENSAGEM_PARA_ENVIAR_QUANDO_RECEBER_TIPO_DESCONHECIDO
          );
          return;
        }
        if (message.type !== "chat") {
          return;
        }
        console.log("Mensagem recebida:", message.body);
        const now = Date.now();
        const lastTimestamp = lastMessageTimestamps.get(chatId) || now;
        const messageCount = messageCountPerChatId.get(chatId) || 0;
        if (now - lastTimestamp > 10 * 1e3) {
          messageCountPerChatId.set(chatId, 1);
          lastMessageTimestamps.set(chatId, now);
        } else {
          messageCountPerChatId.set(chatId, messageCount + 1);
        }
        if (messageCountPerChatId.get(chatId) > 20) {
          console.log(
            "Quantidade excessiva de mensagens, ignorando chamada \xE0 API de IA."
          );
          return;
        }
        if (AI_SELECTED === "GPT") {
          await initializeNewAIChatSession(chatId);
        }
        if (!messageBufferPerChatId.has(chatId)) {
          messageBufferPerChatId.set(chatId, [message.body]);
        } else {
          messageBufferPerChatId.set(chatId, [
            ...messageBufferPerChatId.get(chatId),
            message.body
          ]);
        }
        if (messageTimeouts.has(chatId)) {
          clearTimeout(messageTimeouts.get(chatId));
        }
        console.log(`Aguardando novas mensagens de ${chatId}...`);
        messageTimeouts.set(
          chatId,
          setTimeout(
            () => {
              (async () => {
                const currentMessage = !messageBufferPerChatId.has(chatId) ? message.body : [...messageBufferPerChatId.get(chatId)].join(" \n ");
                let answer = "";
                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                  try {
                    if (AI_SELECTED === "GPT") {
                      answer = await mainOpenAI({
                        currentMessage,
                        chatId
                      });
                    } else {
                      answer = await mainGoogle({
                        currentMessage,
                        chatId
                      });
                    }
                    break;
                  } catch (error) {
                    if (attempt === MAX_RETRIES) {
                      throw error;
                    }
                  }
                }
                const messages = splitMessages(answer);
                console.log("Enviando mensagens...");
                await sendMessagesWithDelay({
                  client,
                  messages,
                  targetNumber: message.from,
                  activeChatsHistory,
                  currentMessage,
                  excludedNumbersIntervention
                });
                messageBufferPerChatId.delete(chatId);
                messageTimeouts.delete(chatId);
              })();
            },
            Number(process.env.SEGUNDOS_PARA_ESPERAR_ANTES_DE_GERAR_RESPOSTA) * 1e3
          )
        );
      }
    })();
  });
}
