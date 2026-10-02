// Runs the mock portal on its own (npm run portal), e.g. to look at it in a browser.
import { MOCK_ACCOUNTS, MOCK_PORTAL_PORT, mockPortalData, readConfig } from "../config.ts";
import { startMockPortal } from "./server.ts";

const { db } = readConfig();
const portal = await startMockPortal({ accounts: MOCK_ACCOUNTS, listTransactions: mockPortalData(db) }, MOCK_PORTAL_PORT);
console.log(`mock portal: ${portal.url}/login  (tram1 / mock-portal-1, tram2 / mock-portal-2)`);
