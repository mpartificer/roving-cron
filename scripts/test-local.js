// Import the Lambda handler
const { handler } = require("../src/index");

// Create a mock event object (similar to what EventBridge would send)
const mockEvent = {};

// Create a mock context object
const mockContext = {
  functionName: "SupabaseEventScanner",
  functionVersion: "$LATEST",
  invokedFunctionArn:
    "arn:aws:lambda:us-east-1:123456789012:function:SupabaseEventScanner",
  memoryLimitInMB: "128",
  awsRequestId: "00000000-0000-0000-0000-000000000000",
  logGroupName: "/aws/lambda/SupabaseEventScanner",
  logStreamName: "2023/01/01/[$LATEST]abcdef123456",
  getRemainingTimeInMillis: () => 30000, // 30 seconds
};

/**
 * Run the Lambda function locally
 */
async function runLocalTest() {
  console.log("🚀 Starting local test of Lambda function...");

  // Check if Supabase credentials are set
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Error: Missing Supabase credentials in .env file");
    console.log(
      "Please create a .env file with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    );
    process.exit(1);
  }

  try {
    console.log("📅 Current date:", new Date().toISOString().split("T")[0]);
    console.log("🔍 Executing Lambda handler...");

    // Execute the handler function
    const result = await handler(mockEvent, mockContext);

    // Format and display the result
    console.log("\n✅ Lambda execution successful!");
    console.log("📊 Status code:", result.statusCode);

    // Parse and format the response body
    const responseBody = JSON.parse(result.body);

    console.log("\n📋 Summary:");
    console.log(
      `- Yesterday (${responseBody.metadata.yesterdayDate}): ${responseBody.yesterdayEvents.length} events`
    );
    console.log(
      `- Today (${responseBody.metadata.todayDate}): ${responseBody.todayEvents.length} events`
    );
    console.log(
      `- Tomorrow (${responseBody.metadata.tomorrowDate}): ${responseBody.tomorrowEvents.length} events`
    );
    console.log(`- Total: ${responseBody.metadata.totalEvents} events`);

    // Display detailed results if there are any events
    if (responseBody.metadata.totalEvents > 0) {
      console.log("\n📝 Detailed Results:");

      if (responseBody.yesterdayEvents.length > 0) {
        console.log("\nYesterday's Events:");
        console.table(responseBody.yesterdayEvents);
      }

      if (responseBody.todayEvents.length > 0) {
        console.log("\nToday's Events:");
        console.table(responseBody.todayEvents);
      }

      if (responseBody.tomorrowEvents.length > 0) {
        console.log("\nTomorrow's Events:");
        console.table(responseBody.tomorrowEvents);
      }
    } else {
      console.log("\n❗ No events found in the specified date range.");
    }
  } catch (error) {
    console.error("❌ Error during execution:", error);
    process.exit(1);
  }
}

// Execute the test
runLocalTest();
