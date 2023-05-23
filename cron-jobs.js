const cron = require("node-cron");
const moment = require("moment");
const plivo = require("plivo");
const axios = require("axios");
const db = require("./app");

const openaiApiKey = "Your-OpenAI-API-Key";
const plivoAuthId = "Your-Plivo-Auth-Id";
const plivoAuthToken = "Your-Plivo-Auth-Token";

const messageClient = new plivo.Client(plivoAuthId, plivoAuthToken);

cron.schedule("0 8 * * *", async () => {
  const today = moment().format("MM-DD");
  const usersSnapshot = await db.ref("users").once("value");
  const users = usersSnapshot.val();

  for (const userId in users) {
    const user = users[userId];
    const reminders = user.reminders;

    for (const reminderId in reminders) {
      const reminder = reminders[reminderId];
      const reminderDate = moment(reminder.date).format("MM-DD");

      if (today === reminderDate) {
        const message = await createMessage(reminder);
        if (message.length > 160) {
          console.error("Message is too long for SMS!");
          continue;
        }

        messageClient.messages.create({
          src: "Your-Source-Phone-Number",
          dst: user.phoneNumber,
          text: message,
        });
      }
    }
  }
});

async function createMessage(reminder) {
  let baseMessage = "REMINDER: ";

  if (reminder.type === "birthday") {
    baseMessage += `Don't forget to wish ${reminder.name} a happy birthday! `;
  } else if (reminder.type === "anniversary") {
    baseMessage += `Today is the anniversary of ${reminder.name}. Don't forget to message them! `;
  } else if (reminder.type === "holiday") {
    baseMessage += `Today is ${reminder.name} holiday. Have a joyous holiday! `;
  } else if (reminder.type === "other") {
    baseMessage += `Today is ${reminder.name}. Don't forget! `;
  }

  if (reminder.type !== "other") {
    baseMessage += "Here are some messages you can send: ";
    const aiMessages = await generateAIMessages(reminder);

    baseMessage += "1. " + aiMessages[0] + " ";
    baseMessage += "2. " + aiMessages[1] + " ";
    baseMessage += "3. " + aiMessages[2] + " ";
  }

  return baseMessage;
}

async function generateAIMessages(reminder) {
  const aiMessages = [];
  const styles = [reminder.style, reminder.style, "simple"];

  for (let i = 0; i < 3; i++) {
    const prompt = `Create a ${styles[i]} ${reminder.type} message for ${reminder.name}.`;
    const maxTokens = 20; // Adjust this based on the length you want for the AI-generated messages

    const response = await axios.post(
      "https://api.openai.com/v1/completions",
      {
        model: "gpt-3.5-turbo",
        prompt: prompt,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
        },
      }
    );

    aiMessages.push(response.data.choices[0].text.trim());
  }

  return aiMessages;
}
