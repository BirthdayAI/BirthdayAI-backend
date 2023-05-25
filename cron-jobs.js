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
    baseMessage += `Wish ${reminder.name} a happy birthday! `;
  } else if (reminder.type === "anniversary") {
    baseMessage += `Anniversary of ${reminder.name} is today! `;
  } else if (reminder.type === "holiday") {
    baseMessage += `Today is ${reminder.name}! Happy Holidays! `;
  } else if (reminder.type === "other") {
    baseMessage += `Today is ${reminder.name}. Don't forget! `;
  }

  if (reminder.type !== "other") {
    const aiMessages = await generateAIMessages(reminder);

    if (aiMessages[0].length > 100) {
      return baseMessage;
    }

    baseMessage += "Message: " + aiMessages[0] + " ";
  }

  return baseMessage;
}

async function generateAIMessages(reminder) {
  const aiMessages = [];
  const styles = [reminder.style];
  for (let i = 0; i < 1; i++) {
    let prompt = `Create a ${styles[i]} ${reminder.type} message for ${reminder.name} who is my ${relationship.type}.`;
    if (reminder.type === "holiday") {
      prompt = `Create a ${styles[i]} ${reminder.type} message to wish others a happy ${reminder.name}.`;
    }
    if (reminder.type === "anniversary") {
      prompt = `Create a ${styles[i]} ${reminder.type} message for ${reminder.name}.`;
    }
    const maxTokens = 25; // Adjust this based on the length you want for the AI-generated messages

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
