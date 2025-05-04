/**
 * Local development script for Supabase Event Scanner
 * This script allows you to run the Lambda function locally with:
 * - Real Supabase connection (using .env credentials)
 * - Simulated daily schedule
 * - Interactive development mode
 */
const { handler } = require("../src/index");
const readline = require("readline");

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Runs the Lambda handler with the specified event
 */
async function runLambda(eventType = "default") {
  console.log("\n🚀 Running Lambda function...");

  let event = {};

  // Build different event types for testing
  switch (eventType) {
    case "error":
      // Temporarily unset environment variables to test error handling
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_URL = "";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "";

      try {
        const result = await handler(event, {});
        console.log("📊 Result:", JSON.stringify(result, null, 2));
      } catch (error) {
        console.error("❌ Error:", error);
      } finally {
        // Restore environment variables
        process.env.SUPABASE_URL = originalUrl;
        process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
      }
      break;

    case "custom-date":
      // Ask for a custom date to simulate
      rl.question("Enter custom date (YYYY-MM-DD): ", async (customDate) => {
        try {
          // Override current date for testing
          const RealDate = Date;
          const customDateObj = new Date(customDate + "T12:00:00Z");

          // Mock Date constructor
          global.Date = class extends Date {
            constructor(...args) {
              if (args.length === 0) {
                return customDateObj;
              }
              return new RealDate(...args);
            }
          };

          console.log(`🗓️ Testing with custom date: ${customDate}`);
          const result = await handler(event, {});
          console.log("📊 Result:", JSON.stringify(result, null, 2));

          // Restore Date
          global.Date = RealDate;
          showMenu();
        } catch (error) {
          console.error("❌ Error:", error);
          showMenu();
        }
      });
      return; // Don't proceed to showMenu since we're already using readline

    default:
      try {
        const result = await handler(event, {});
        console.log("📊 Result:", JSON.stringify(result, null, 2));

        // Parse and display the body content
        if (result.body) {
          const body = JSON.parse(result.body);

          console.log("\n📅 Event Summary:");
          if (body.yesterdayEvents && body.yesterdayEvents.length > 0) {
            console.log(
              `\nYesterday's Events (${body.metadata.yesterdayDate}):`
            );
            body.yesterdayEvents.forEach((event) => {
              console.log(
                `- ${event.id}: ${event.title || "Untitled"} (${
                  event.status || "No status"
                })`
              );
            });
          } else {
            console.log(
              `\nNo events found for yesterday (${body.metadata.yesterdayDate})`
            );
          }

          if (body.todayEvents && body.todayEvents.length > 0) {
            console.log(`\nToday's Events (${body.metadata.todayDate}):`);
            body.todayEvents.forEach((event) => {
              console.log(
                `- ${event.id}: ${event.title || "Untitled"} (${
                  event.status || "No status"
                })`
              );
            });
          } else {
            console.log(
              `\nNo events found for today (${body.metadata.todayDate})`
            );
          }

          if (body.tomorrowEvents && body.tomorrowEvents.length > 0) {
            console.log(`\nTomorrow's Events (${body.metadata.tomorrowDate}):`);
            body.tomorrowEvents.forEach((event) => {
              console.log(
                `- ${event.id}: ${event.title || "Untitled"} (${
                  event.status || "No status"
                })`
              );
            });
          } else {
            console.log(
              `\nNo events found for tomorrow (${body.metadata.tomorrowDate})`
            );
          }

          console.log(`\nTotal events: ${body.metadata.totalEvents}`);
        }
      } catch (error) {
        console.error("❌ Error:", error);
      }
  }

  showMenu();
}

/**
 * Shows the interactive menu
 */
function showMenu() {
  console.log("\n📋 Development Menu:");
  console.log("1) Run Lambda with current date");
  console.log("2) Run Lambda with custom date");
  console.log("3) Test error handling");
  console.log("4) Exit");

  rl.question("Select an option: ", (answer) => {
    switch (answer.trim()) {
      case "1":
        runLambda();
        break;
      case "2":
        runLambda("custom-date");
        break;
      case "3":
        runLambda("error");
        break;
      case "4":
        console.log("👋 Exiting...");
        rl.close();
        process.exit(0);
        break;
      default:
        console.log("❌ Invalid option");
        showMenu();
    }
  });
}

// Check if environment variables are set
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env file"
  );
  process.exit(1);
}

// Start the interactive menu
console.log("🔧 Supabase Event Scanner - Local Development");
console.log("Connected to:", process.env.SUPABASE_URL);
showMenu();
