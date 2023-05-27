const cron = require("node-cron");
const moment = require("moment");
const telnyx = require("telnyx")(process.env.TELNYX_API_KEY);
const db = require("./database");
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

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

      if (today === reminderDate) {
        const message = await createMessage(reminder);

        telnyx.messages
          .create({
            from: "+18333371805", // Your Telnyx number
            to: "+" + user.phoneNumber,
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

    baseMessage += "Message: " + aiMessages[0] + " ";
  }

  return baseMessage;
}

async function generateAIMessages(reminder) {
  const aiMessages = [];
  const styles = [reminder.style];
  for (let i = 0; i < 1; i++) {
    let prompt = `Create a ${styles[i]} ${reminder.type} message for ${reminder.name} who is my ${reminder.relationship}.`;
    if (reminder.type === "holiday") {
      prompt = `Create a ${styles[i]} ${reminder.type} message to wish others a happy ${reminder.name}.`;
    }
    if (reminder.type === "anniversary") {
      prompt = `Create a ${styles[i]} ${reminder.type} message for ${reminder.name}.`;
    }
    const maxTokens = 22; // Adjust this based on the length you want for the AI-generated messages

    try {
      const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
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
