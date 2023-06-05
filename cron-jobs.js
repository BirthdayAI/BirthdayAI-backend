const cron = require("node-cron");
const moment = require("moment");
const telnyx = require("telnyx")(process.env.TELNYX_API_KEY);
const db = require("./database");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

function removeEmojis(text) {
  return text.replace(
    /[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{1F1E0}-\u{1F1FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}]/gu,
    ""
  );
}

cron.schedule("0 13 * * *", async () => {
  const today = moment().format("MM-DD");
  const usersSnapshot = await db.ref("users").once("value");
  const users = usersSnapshot.val();

  for (const userId in users) {
    const user = users[userId];
    const reminders = user.reminders;

    for (const reminderId in reminders) {
      const reminder = reminders[reminderId];
      const reminderDate = moment(reminder.date).format("MM-DD");
      const giftDate = moment(reminder.date)
        .subtract(7, "days")
        .format("MM-DD");
      if (today === reminderDate) {
        const message = await createMessage(reminder);

        telnyx.messages
          .create({
            from: "+18333371805", // Your Telnyx number
            to: user.phoneNumber,
            text: message,
            messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
          })
          .then(function (response) {
            const message = response.data; // asynchronously handled
          });
      } else if (today === giftDate && reminder.gift === true) {
        const message = await createGiftMessage(reminder);
        telnyx.messages
          .create({
            from: "+18333371805", // Your Telnyx number
            to: user.phoneNumber,
            text: message,
            messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
          })
          .then(function (response) {
            const message = response.data; // asynchronously handled
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

    baseMessage += "Message: " + removeEmojis(aiMessages[0]) + " ";
  }

  return baseMessage;
}

async function generateAIMessages(reminder) {
  const aiMessages = [];
  const styles = [reminder.style];
  for (let i = 0; i < 1; i++) {
    let prompt = `Create a ${styles[i]} ${reminder.type} message for ${reminder.name} who is my ${reminder.relationship}. Has to be short and quick to the point.`;
    if (reminder.type === "holiday") {
      prompt = `Create a ${styles[i]} ${reminder.type} message to wish others a happy ${reminder.name}. Has to be short and quick to the point.`;
    }
    if (reminder.type === "anniversary") {
      prompt = `Create a ${styles[i]} ${reminder.type} message for ${reminder.name}. Has to be short and quick to the point.`;
    }
    const maxTokens = 20; // Adjust this based on the length you want for the AI-generated messages

    try {
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "assistant",
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
      });
      aiMessages.push(completion.data.choices[0].message.content.trim());
    } catch (error) {
      console.error("Error with OpenAI API call:", error);
    }
  }

  return aiMessages;
}

async function createGiftMessage(reminder) {
  let baseMessage = `${reminder.type.toUpperCase()} Gift Suggestion for ${
    reminder.name
  }: `;

  const aiMessages = await generateAIGift(reminder);

  if (aiMessages[0].length > 106) {
    return baseMessage;
  }

  baseMessage += removeEmojis(aiMessages[0]);

  return baseMessage;
}

async function generateAIGift(reminder) {
  const aiMessages = [];
  const styles = [reminder.style];
  for (let i = 0; i < 1; i++) {
    let prompt = `Suggest a ${reminder.type} gift for my ${reminder.relationship}, short description is "${reminder.description}". Give two suggestions and only include the gift names in your response.`;
    const maxTokens = 20; // Adjust this based on the length you want for the AI-generated messages

    try {
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "assistant",
            content: prompt,
          },
        ],
        max_tokens: maxTokens,
      });
      aiMessages.push(completion.data.choices[0].message.content.trim());
    } catch (error) {
      console.error("Error with OpenAI API call:", error);
    }
  }

  return aiMessages;
}
