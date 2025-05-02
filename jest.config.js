/**
 * Jest configuration for the Supabase Event Scanner Lambda
 */
module.exports = {
  // The test environment that will be used for testing
  testEnvironment: "node",

  // The glob patterns Jest uses to detect test files
  testMatch: ["**/test/**/*.test.js", "**/__tests__/**/*.js"],

  // An array of regexp pattern strings that are matched against all test paths
  testPathIgnorePatterns: ["/node_modules/"],

  // An array of regexp pattern strings that are matched against all source file paths
  transformIgnorePatterns: ["/node_modules/"],

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: ["/node_modules/", "/test/"],

  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: ["json", "text", "lcov", "clover"],

  // Collect coverage from these directories
  collectCoverageFrom: ["src/**/*.js"],

  // Set the timeout for tests to 10 seconds (Lambda has a timeout too)
  testTimeout: 10000,

  // Use fake timers for tests that involve time
  fakeTimers: {
    enableGlobally: true,
  },
};
