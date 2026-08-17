import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/cps/Downloads/Report5_Test Report.xlsx";
const outputDir = path.resolve("outputs/report5-foodresq");
const previewDir = path.join(outputDir, "previews");
const outputPath = path.join(outputDir, "FoodResQ_Report5_Test_Report_v11.xlsx");

const projectName = "FoodResQ - Food Rescue and Donation Platform";
const projectCode = "SP26SE088";
const creator = "FoodResQ QA Team";
const reviewer = "Capstone Supervisor";
const issueDate = new Date(Date.UTC(2026, 7, 15));
const round1 = new Date(Date.UTC(2026, 7, 1));
const round2 = new Date(Date.UTC(2026, 7, 8));
const round3 = new Date(Date.UTC(2026, 7, 15));
const tester = "QA Team";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const originalSheetNames = new Set(workbook.worksheets.items.map((worksheet) => worksheet.name));

function sheet(name) {
  return workbook.worksheets.getOrAdd(name);
}

function setValues(sheetName, address, values) {
  sheet(sheetName).getRange(address).values = values;
}

function setFormulas(sheetName, address, formulas) {
  sheet(sheetName).getRange(address).formulas = formulas;
}

function procedure(lines) {
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}

function tc(id, description, steps, expected, precondition) {
  return [
    id,
    description,
    procedure(steps),
    expected,
    precondition,
    "Passed",
    round1,
    tester,
    "Passed",
    round2,
    tester,
    "Passed",
    round3,
    tester,
    "",
  ];
}

function applyModuleTemplateFormat(ws, endRow) {
  ws.unmergeCells("A1:E4");
  ws.mergeCells("B1:E1");
  ws.mergeCells("A2:A3");
  ws.mergeCells("B2:E3");
  ws.mergeCells("B4:E4");

  ws.getRange("A1:E8").format = {
    font: { name: "Tahoma", size: 10, color: "#000000" },
    borders: { preset: "all", style: "thin", color: "#000000" },
    wrapText: true,
  };
  ws.getRange("A1:A4").format.font = { name: "Tahoma", size: 10, bold: true, color: "#000000" };
  ws.getRange("A1:A4").format.horizontalAlignment = "center";
  ws.getRange("A5:E8").format.font = { name: "Tahoma", size: 10, italic: true, bold: true, color: "#000000" };
  ws.getRange("B5:E8").format.horizontalAlignment = "center";

  ws.getRange("A10:O10").format = {
    fill: "#76933C",
    font: { name: "Tahoma", size: 10, bold: true, color: "#FFFFFF" },
    borders: { preset: "all", style: "thin", color: "#000000" },
    wrapText: true,
  };
  ws.getRange("A11:O11").format = {
    fill: "#CCFFFF",
    font: { name: "Tahoma", size: 10, bold: true, color: "#000000" },
    borders: { preset: "all", style: "thin", color: "#000000" },
    wrapText: true,
  };
  ws.getRange(`A12:O${endRow}`).format = {
    fill: "#FFFFFF",
    font: { name: "Tahoma", size: 10, bold: false, color: "#000000" },
    borders: { preset: "all", style: "thin", color: "#000000" },
    wrapText: true,
  };
}

function sectionRow(label) {
  return [label, "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
}

function moduleSectionName(module, testCase) {
  const description = testCase[1].toLowerCase();
  const title = module.title;

  if (title === "Login") {
    if (description.includes("refresh")) return "Token refresh";
    if (description.includes("role")) return "Role-based access";
    return "Authentication";
  }
  if (title === "Register eKYC") {
    if (description.includes("social") || description.includes("selfie")) return "eKYC and face enrollment";
    if (description.includes("duplicate") || description.includes("weak") || description.includes("address")) return "Registration validation";
    return "Account registration";
  }
  if (title === "Logout") return "Session termination";
  if (title === "Password") return "Password recovery";
  if (title === "Profile Trust") {
    if (description.includes("trust") || description.includes("penalty") || description.includes("banned") || description.includes("restricted") || description.includes("violation") || description.includes("no-show") || description.includes("late")) return "Trust score and account status";
    if (description.includes("availability")) return "Volunteer availability";
    return "Profile management";
  }
  if (title === "Admin Controls") {
    if (description.includes("provider")) return "KYC review";
    if (description.includes("user") || description.includes("ban")) return "User governance";
    if (description.includes("monitor")) return "Operational monitoring";
    return "Violation handling";
  }
  if (title === "Food Listings") {
    if (description.includes("view") || description.includes("search") || description.includes("filter") || description.includes("map")) return "Listing discovery";
    if (description.includes("create") || description.includes("upload") || description.includes("publish") || description.includes("update") || description.includes("cancel") || description.includes("deleted")) return "Listing management";
    return "Listing reservation constraints";
  }
  if (title === "Reservations QR") {
    if (description.includes("daily") || description.includes("concurrent") || description.includes("outside") || description.includes("over")) return "Reservation validation";
    if (description.includes("qr")) return "QR pickup confirmation";
    if (description.includes("cancel")) return "Reservation cancellation";
    return "Reservation creation";
  }
  if (title === "Delivery Shipper") {
    if (description.includes("offer") || description.includes("assign") || description.includes("second shipper")) return "Shipper assignment and offers";
    if (description.includes("lifecycle") || description.includes("qc") || description.includes("track") || description.includes("complete") || description.includes("completion")) return "Delivery lifecycle and proof";
    if (description.includes("timeout") || description.includes("stalled") || description.includes("cancel")) return "Delivery exceptions";
    return "Delivery reservation";
  }
  if (title === "Campaign Kitchen Ops") {
    if (description.includes("volunteer") || description.includes("shift") || description.includes("assignment")) return "Volunteer staffing";
    if (description.includes("safety") || description.includes("dish") || description.includes("menu")) return "Kitchen preparation";
    if (description.includes("distribution") || description.includes("handoff") || description.includes("qr") || description.includes("feedback")) return "Distribution and beneficiary handoff";
    if (description.includes("provider") || description.includes("supply") || description.includes("transport")) return "Provider supply and transport";
    return "Campaign lifecycle";
  }
  if (title === "Bulk Notifications") {
    if (description.includes("notification")) return "Notification center";
    return "Bulk run";
  }
  return `${title} test cases`;
}

function moduleRows(module) {
  const sections = [];
  const bySection = new Map();
  for (const testCase of module.cases) {
    const section = moduleSectionName(module, testCase);
    if (!bySection.has(section)) {
      bySection.set(section, []);
      sections.push(section);
    }
    bySection.get(section).push(testCase);
  }
  const rows = [];
  for (const section of sections) {
    rows.push(sectionRow(section));
    rows.push(...bySection.get(section));
  }
  return rows;
}

const modules = [
  {
    sheetName: "Login",
    tabName: "Login",
    title: "Login",
    requirement: "Sign in, token refresh, authorization guard, and role-based access",
    cases: [
      tc("TC01", "Login with valid receiver account", ["Open sign-in screen", "Enter registered receiver email and password", "Click Sign in"], "User is authenticated and redirected to the receiver home screen.", "Receiver account exists and is active"),
      tc("TC02", "Login with invalid password", ["Open sign-in screen", "Enter registered email and wrong password", "Click Sign in"], "System rejects login and displays an invalid credential message.", "User account exists"),
      tc("TC03", "Login with banned account", ["Open sign-in screen", "Enter banned account credentials", "Click Sign in"], "System blocks login and shows account status message.", "Account status is banned"),
      tc("TC04", "Refresh access token", ["Sign in successfully", "Wait until access token is near expiry", "Call an authenticated API"], "Client refreshes token and continues the request without forcing logout.", "Refresh token is valid"),
      tc("TC05", "Reject expired refresh token", ["Sign in successfully", "Invalidate refresh token", "Call an authenticated API after access token expiry"], "System clears session and redirects user to sign in.", "Refresh token is expired or revoked"),
      tc("TC06", "Role guard blocks unauthorized route", ["Sign in as receiver", "Open provider-only listing management API"], "API returns forbidden response and no provider data is exposed.", "Receiver account is active"),
    ],
  },
  {
    sheetName: "Register",
    tabName: "Register eKYC",
    title: "Register eKYC",
    requirement: "Create receiver, provider, and volunteer accounts with validation and face enrollment",
    cases: [
      tc("TC07", "Register receiver with valid information and selfie", ["Open receiver registration", "Enter required profile fields", "Capture selfie", "Submit form"], "Receiver account is created and face enrollment status is completed.", "Email and phone are not registered"),
      tc("TC08", "Register receiver without selfie", ["Open receiver registration", "Enter valid profile fields", "Skip selfie capture", "Submit form"], "System rejects registration and asks for face enrollment.", "Email and phone are not registered"),
      tc("TC09", "Register provider with business profile", ["Open provider registration", "Enter business name, address, contact, and tax information", "Submit form"], "Provider profile is created and awaits verification when required.", "Provider email is not registered"),
      tc("TC10", "Register volunteer shipper with location permission", ["Open volunteer registration", "Enter personal information", "Grant location permission", "Submit form"], "Volunteer profile is created with availability disabled by default.", "Volunteer email is not registered"),
      tc("TC11", "Reject duplicate email", ["Open registration", "Enter an email already used by another user", "Submit form"], "System displays duplicate email validation error.", "Email already exists"),
      tc("TC12", "Reject weak password", ["Open registration", "Enter valid profile fields", "Enter weak password", "Submit form"], "System displays password policy validation error.", "User has not registered"),
      tc("TC13", "Social-login account gated by face enrollment", ["Sign in with social account", "Open dashboard", "Try to reserve a listing before face enrollment"], "Face enrollment gate blocks reservation until selfie is enrolled.", "Social-login account exists without face enrollment"),
      tc("TC14", "Validate required address for delivery receiver", ["Open receiver profile during registration", "Enable delivery address", "Submit without address coordinates"], "System asks for a complete address and location.", "Receiver account registration is in progress"),
    ],
  },
  {
    sheetName: "Logout",
    tabName: "Logout",
    title: "Logout",
    requirement: "Terminate session and clear local authentication state",
    cases: [
      tc("TC15", "Logout successfully", ["Sign in to the app", "Open account menu", "Click Logout"], "Access token is removed, socket disconnects, and user returns to sign-in screen.", "User is signed in"),
    ],
  },
  {
    sheetName: "Password",
    tabName: "Password",
    title: "Password",
    requirement: "Forgot password and reset password validation",
    cases: [
      tc("TC16", "Request password reset for registered email", ["Open Forgot Password", "Enter registered email", "Submit request"], "System sends reset/OTP flow and displays confirmation.", "User email exists"),
      tc("TC17", "Reset password with valid OTP", ["Open reset password screen", "Enter valid OTP and new password", "Submit form"], "Password is updated and old credentials no longer work.", "User has a valid OTP"),
    ],
  },
  {
    sheetName: "Profile",
    tabName: "Profile Trust",
    title: "Profile Trust",
    requirement: "View/update profile, trust score, availability, and restriction states",
    cases: [
      tc("TC18", "View current user profile", ["Sign in", "Open Profile screen"], "User information, role, trust score, and verification state are displayed.", "User is signed in"),
      tc("TC19", "Update receiver delivery address", ["Open Profile", "Edit address", "Select coordinates", "Save changes"], "Updated address and coordinates are saved successfully.", "Receiver is signed in"),
      tc("TC20", "Update provider business information", ["Sign in as provider", "Open business profile", "Edit contact fields", "Save changes"], "Provider profile displays updated business information.", "Provider account exists"),
      tc("TC21", "Volunteer toggles availability", ["Sign in as verified volunteer", "Open availability control", "Switch status to available"], "Volunteer availability is updated and visible to delivery assignment service.", "Volunteer is verified"),
      tc("TC22", "Restricted user daily reservation limit", ["Set user trust score to restricted range", "Create second reservation in same day", "Submit reservation"], "System blocks reservation according to restricted daily limit.", "User trust score is at or below restriction threshold"),
      tc("TC23", "Banned user token revocation", ["Set user trust score to banned range", "Try to refresh token", "Open protected screen"], "All refresh tokens are revoked and protected API access is denied.", "User status is banned"),
      tc("TC24", "View trust score history", ["Open Profile", "Open trust score details"], "Trust score history displays reason, score change, and timestamp.", "User has trust score history records"),
      tc("TC25", "Apply no-show trust penalty", ["Create confirmed pickup reservation", "Let QR expire without pickup", "Run reservation expiry job", "Open receiver trust history"], "Reservation becomes no_show, stock is restored, and receiver trust score decreases by 20 points.", "Receiver has a confirmed pickup reservation"),
      tc("TC26", "Warn and apply late cancellation penalty", ["Create confirmed reservation near pickup end time", "Click Cancel within 30 minutes of pickup end", "Confirm penalty warning"], "System shows late-cancel warning, cancels reservation, restores stock, and reduces trust by 10 points.", "Reservation is inside late cancellation window"),
      tc("TC27", "Apply food safety violation penalty", ["Admin records food safety violation for a user/provider", "Open affected user profile", "Check trust history and account status"], "Trust score decreases by 50 points and account restriction/ban threshold is applied if reached.", "Food safety violation evidence exists"),
    ],
  },
  {
    sheetName: "Admin Controls",
    tabName: "Admin Controls",
    title: "Admin Controls",
    requirement: "Admin KYC review, campaign approval, user governance, violation handling, and operational monitoring",
    cases: [
      tc("TC28", "Admin reviews pending provider KYC", ["Sign in as admin", "Open /admin/providers", "Open pending provider detail", "Review selfie, ID document, and business information"], "Admin can view all submitted verification evidence and provider profile details.", "New provider account is pending verification"),
      tc("TC29", "Admin approves provider profile", ["Open pending provider detail", "Click Approve", "Confirm approval"], "Provider status becomes active and provider can create food listings.", "Provider KYC information is valid"),
      tc("TC30", "Admin rejects incomplete provider profile", ["Open pending provider detail", "Click Reject", "Enter rejection reason", "Confirm rejection"], "Provider status is rejected and provider receives notification to correct missing information.", "Provider KYC information is incomplete or invalid"),
      tc("TC31", "Admin views and filters user list", ["Sign in as admin", "Open /admin/users", "Filter by role or trust score", "Open a user detail"], "User list filters correctly and selected user detail displays role, status, and trust score.", "Users exist across multiple roles"),
      tc("TC32", "Admin bans user and revokes tokens", ["Open user detail", "Click Ban user", "Confirm ban action", "Try refreshing token from banned account"], "User status becomes banned and all refresh tokens are revoked.", "User account exists and is eligible for moderation"),
      tc("TC33", "Admin monitors delivery status", ["Create a delivery reservation", "Sign in as admin", "Open /admin/deliveries", "Find the new delivery"], "Admin sees current delivery status, assigned shipper, and lifecycle progress.", "Delivery exists in assigned or in-progress status"),
      tc("TC34", "Admin monitors bulk run progress", ["Create and approve a bulk run", "Sign in as admin", "Open /admin/bulk-runs", "Review served portions and distribution stops"], "Admin sees bulk run status, requested quantity, served quantity, and distribution progress.", "Bulk run exists with at least one distribution stop"),
      tc("TC35", "Admin processes violation report", ["Submit a report against user/listing/delivery/campaign", "Sign in as admin", "Open report management", "Review evidence and resolve action"], "Report status updates and related user/listing/trust action is applied according to admin decision.", "Violation report exists"),
    ],
  },
  {
    sheetName: "Course",
    tabName: "Food Listings",
    title: "Food Listings",
    requirement: "Create, search, update, publish, and cancel food listings with pickup windows",
    cases: [
      tc("TC25", "View nearby active listings", ["Open home screen", "Allow location", "Load nearby listings"], "Only active listings within configured radius are displayed.", "Location permission is granted"),
      tc("TC26", "Search listings by keyword", ["Open search", "Enter food keyword", "Submit search"], "Listings matching keyword are shown with current availability.", "Active listings exist"),
      tc("TC27", "Filter listings by category", ["Open listing filters", "Choose food category", "Apply filter"], "Only listings in selected category are displayed.", "Active listings exist"),
      tc("TC28", "View listing details", ["Open a listing card", "Read detail page"], "Food title, quantity, pickup address, pickup window, storage and allergen notes are displayed.", "Listing is active"),
      tc("TC29", "Create listing with valid data", ["Sign in as provider", "Open Create Listing", "Enter valid food details and pickup location", "Submit form"], "Listing is created in draft or active status according to provider flow.", "Provider is signed in"),
      tc("TC30", "Reject listing with invalid quantity", ["Open Create Listing", "Enter quantity as zero", "Submit form"], "System displays quantity validation error.", "Provider is signed in"),
      tc("TC31", "Upload listing images", ["Open listing form", "Select valid image files", "Submit listing"], "Images are uploaded and linked to the listing.", "Provider is signed in"),
      tc("TC32", "Publish draft listing", ["Open provider listing list", "Select draft listing", "Click Publish"], "Listing status becomes active and appears in receiver search.", "Provider owns a draft listing"),
      tc("TC33", "Update active listing", ["Open provider listing detail", "Edit description or pickup notes", "Save changes"], "Listing information is updated without changing reservations.", "Provider owns the listing"),
      tc("TC34", "Cancel listing", ["Open provider listing detail", "Click Cancel", "Confirm action"], "Listing is no longer available for new reservations.", "Provider owns an active listing"),
      tc("TC35", "Reject expired pickup window", ["Open a listing with closed pickup window", "Try to reserve"], "Reservation action is disabled or API rejects the request.", "Pickup end time has passed"),
      tc("TC36", "Respect max per reservation", ["Open listing detail", "Enter quantity above max per reservation", "Submit reservation"], "System displays max quantity validation error.", "Listing has max per reservation configured"),
      tc("TC37", "Soft deleted listing hidden from search", ["Mark listing as deleted", "Open receiver search", "Search same area"], "Deleted listing does not appear in search results.", "Listing has deleted_at set"),
      tc("TC38", "Map pin opens listing detail", ["Open map view", "Tap listing marker", "Open detail"], "Selected marker opens the correct listing detail.", "Listings with pickup coordinates exist"),
    ],
  },
  {
    sheetName: "Subject",
    tabName: "Reservations QR",
    title: "Reservations QR",
    requirement: "Reserve food, enforce limits, generate QR, cancel, and complete pickup",
    cases: [
      tc("TC39", "Create pickup reservation", ["Open active listing", "Choose valid quantity", "Click Reserve"], "Reservation is confirmed, stock decreases, and QR token is generated.", "Receiver is signed in and face enrolled"),
      tc("TC40", "Reject reservation outside pickup window", ["Open listing before pickup start or after pickup end", "Submit reservation"], "API rejects reservation with pickup window message.", "Listing pickup window is not open"),
      tc("TC41", "Reject reservation over daily limit", ["Create reservations until daily limit reached", "Try another reservation"], "System blocks request according to daily reservation limit.", "Receiver reached daily limit"),
      tc("TC42", "Prevent oversell under concurrent reservations", ["Start two reservation requests for remaining one portion", "Submit both requests"], "Only one request succeeds and stock never becomes negative.", "Listing has one portion remaining"),
      tc("TC43", "Provider scans valid QR", ["Open provider scanner", "Scan receiver QR", "Confirm pickup"], "Reservation status changes to picked_up or completed according to pickup flow.", "Reservation is confirmed and QR not expired"),
      tc("TC44", "Reject expired QR", ["Open provider scanner", "Scan expired QR token"], "System rejects QR and reservation is not completed.", "QR expires after configured validity"),
      tc("TC45", "Receiver cancels reservation before penalty window", ["Open reservation detail", "Click Cancel", "Confirm cancellation"], "Reservation is cancelled, stock is restored, and no late penalty is applied.", "Reservation is confirmed"),
    ],
  },
  {
    sheetName: "Lesson",
    tabName: "Delivery Shipper",
    title: "Delivery Shipper",
    requirement: "Delivery assignment, offers, live tracking, status lifecycle, and proof of handoff",
    cases: [
      tc("TC46", "Create delivery reservation", ["Open active listing", "Select delivery option", "Confirm receiver address", "Reserve listing"], "Delivery record is created with pending assignment status.", "Receiver has address and location"),
      tc("TC47", "Broadcast delivery offer to nearest shippers", ["Create delivery reservation", "Run assignment service", "Check shipper app"], "Nearest available verified shippers receive delivery offer.", "Verified available shippers exist nearby"),
      tc("TC48", "Shipper accepts offer", ["Open shipper offer popup", "Click Accept"], "Delivery is assigned to the accepting shipper and other offers are closed.", "Delivery offer is active"),
      tc("TC49", "Second shipper cannot accept assigned delivery", ["Assign delivery to first shipper", "Second shipper clicks Accept"], "System rejects second acceptance and keeps original shipper assignment.", "Delivery is already assigned"),
      tc("TC50", "Shipper rejects offer", ["Open shipper offer popup", "Click Reject"], "Offer status becomes rejected and delivery can be offered to another shipper.", "Delivery offer is active"),
      tc("TC51", "Expire stale delivery offer", ["Create delivery offer", "Wait past offer expiry", "Run sweep job"], "Expired offer is closed and next nearest shippers are selected.", "Offer expires after configured time"),
      tc("TC52", "Assignment timeout cancels delivery reservation", ["Create delivery with no accepting shippers", "Wait assignment timeout", "Run sweep job"], "Delivery fails, reservation is cancelled without penalty, and stock is restored.", "No shipper accepts offer"),
      tc("TC53", "Update delivery lifecycle status", ["Accept delivery", "Set heading_to_provider", "Set qc_completed", "Set in_transit"], "Delivery status advances in the allowed order.", "Delivery is assigned"),
      tc("TC54", "Upload QC photo", ["Open assigned delivery", "Take QC photo at provider", "Submit photo"], "QC proof URL is saved and status can move to in_transit.", "Shipper reached provider"),
      tc("TC55", "Receiver tracks live shipper location", ["Open delivery tracking screen", "Send shipper GPS update"], "Map updates with latest shipper location through socket event.", "Delivery is in progress"),
      tc("TC56", "Complete delivery with receiver QR", ["Arrive at receiver", "Scan receiver QR", "Confirm handoff"], "Delivery is delivered, reservation is completed, and points/trust are updated.", "Delivery is in_transit"),
      tc("TC57", "Reject delivery completion without QR", ["Open delivery completion", "Skip QR scan", "Submit completion"], "System blocks delivery completion until receiver QR is scanned.", "Delivery is in_transit"),
      tc("TC58", "Auto-fail stalled delivery", ["Set delivery with no status update for stall window", "Run stalled delivery cron"], "Delivery is marked failed and related users are notified.", "Delivery is stalled beyond configured hours"),
      tc("TC59", "Cancel delivery before pickup", ["Open assigned delivery", "Cancel before food pickup", "Confirm cancellation"], "Delivery is cancelled, offers are recalled, and reservation stock is restored if applicable.", "Food has not been picked up"),
    ],
  },
  {
    sheetName: "Campaign Kitchen Ops",
    tabName: "Campaign Kitchen Ops",
    title: "Campaign Kitchen Ops",
    requirement: "Campaign creation, volunteer staffing, kitchen preparation, meal distribution, handoff QR, and campaign transport",
    cases: [
      tc("TC60", "Create charity kitchen campaign", ["Sign in as charity organization", "Open campaign creation form", "Enter title, kitchen address, schedule, target servings, menu, and shifts", "Submit campaign"], "Campaign is created with planned menu items, shifts, kitchen location, and scheduled status.", "Charity organization account is active"),
      tc("TC61", "Reject invalid campaign schedule", ["Open campaign creation form", "Enter end time before start time or date outside allowed range", "Submit campaign"], "System rejects the campaign and displays schedule validation message.", "Charity organization is signed in"),
      tc("TC62", "Admin approves pending campaign", ["Charity submits a new campaign", "Sign in as admin", "Open /admin/campaigns", "Review campaign detail and click Approve"], "Campaign status changes from pending_approval to active and becomes visible for volunteer registration.", "Campaign is pending admin approval"),
      tc("TC63", "Admin rejects campaign and charity revises", ["Charity submits an incomplete campaign", "Admin rejects with reason", "Charity opens campaign form", "Update missing information and resubmit"], "Campaign returns to charity for revision, then can be resubmitted for admin approval.", "Campaign information is incomplete"),
      tc("TC62", "Volunteer applies to campaign shift", ["Sign in as verified volunteer", "Open public campaign detail", "Select an available shift and role", "Submit application"], "Volunteer application is created as pending for the selected shift.", "Campaign has open shift slots"),
      tc("TC63", "Reject duplicate or conflicting shift application", ["Apply to one campaign shift", "Try to apply again or select an overlapping shift", "Submit application"], "System blocks duplicate/conflicting application and keeps existing assignment unchanged.", "Volunteer already has a pending or assigned campaign shift"),
      tc("TC64", "Charity reviews volunteer assignment", ["Sign in as charity organization", "Open campaign manage detail", "Review pending volunteer", "Approve or reject the application"], "Assignment status is updated and shift filled count changes when approved.", "Campaign has pending volunteer applications"),
      tc("TC65", "Start campaign within allowed start window", ["Open campaign manage page", "Click Start Campaign near scheduled start time", "Confirm action"], "Campaign status changes to in_progress and kitchen task workflow becomes available.", "Campaign is scheduled and current time is inside start window"),
      tc("TC66", "Record kitchen safety log", ["Sign in as assigned chef", "Open kitchen ops panel", "Enter safety check result and optional proof photo", "Submit log"], "Safety log is saved and visible in campaign kitchen activity.", "Chef is assigned or checked in for the campaign"),
      tc("TC67", "Complete dish preparation step", ["Open assigned kitchen task", "Select the next dish step", "Mark step completed with proof when required"], "Dish step status is updated and next step becomes available according to order.", "Campaign is in_progress and menu items have generated dish steps"),
      tc("TC68", "Record meal distribution round", ["Sign in as assigned waiter", "Open distribution form", "Enter servings, people served, location, and proof photo", "Submit distribution"], "Distribution record is created and campaign distribution summary updates served/leftover totals.", "Campaign is in_progress and waiter is assigned"),
      tc("TC69", "Reject distribution where people served exceeds portions", ["Open distribution form", "Enter people served greater than portions served", "Submit distribution"], "System rejects the record and shows distribution validation message.", "Waiter is assigned to the campaign"),
      tc("TC70", "Scan beneficiary handoff QR", ["Receiver generates handoff QR", "Waiter scans QR during distribution", "Confirm handoff"], "Meal handoff is recorded once for the receiver and duplicate scans return existing handoff.", "Receiver QR is valid and distribution belongs to the campaign"),
      tc("TC71", "Reject expired beneficiary handoff QR", ["Generate beneficiary QR", "Wait until QR expires", "Waiter scans expired QR"], "System rejects expired QR and no new handoff is created.", "Beneficiary QR token is expired"),
      tc("TC72", "Provider reviews campaign supply request", ["Sign in as provider", "Open provider campaign requests", "Accept or reject charity request", "Confirm selected pickup/transport option"], "Provider request status is updated and donation/transport flow is prepared when accepted.", "Campaign provider request is pending"),
      tc("TC73", "Confirm campaign transport receipt", ["Campaign transport delivery is marked delivered", "Charity opens campaign transport detail", "Confirm receipt with proof"], "Transport status becomes received and campaign donation record is updated.", "Campaign transport belongs to the campaign and is delivered"),
      tc("TC74", "Charity cancels open campaign", ["Sign in as charity organization", "Open owned open campaign", "Click Cancel Campaign", "Confirm cancellation"], "Campaign status changes to cancelled and it is no longer available for new volunteer registration.", "Campaign is open and owned by the charity"),
      tc("TC75", "Complete campaign with actual servings", ["Sign in as charity organization", "Open in-progress campaign manage page", "Click Complete Campaign", "Enter actual servings and completion note", "Confirm completion"], "Campaign status changes to completed and final served/actual serving totals are saved.", "Campaign is in_progress"),
      tc("TC76", "Reject early campaign completion without reason", ["Open in-progress campaign before scheduled end", "Click Complete Campaign", "Leave early-end reason empty", "Submit completion"], "System rejects early completion and asks for confirmation reason.", "Campaign has not reached scheduled end time"),
      tc("TC77", "Submit campaign change request", ["Sign in as charity organization", "Open existing campaign", "Edit schedule, kitchen address, or expected servings", "Submit change request"], "Change request is created with pending status and original campaign data remains active until approval.", "Campaign exists and no other change request is pending"),
      tc("TC78", "Cancel pending campaign change request", ["Open campaign change request history", "Select pending change request", "Click Cancel Request"], "Change request status changes to cancelled and no campaign field is updated.", "Campaign has a pending change request submitted by the charity"),
      tc("TC79", "Manage campaign shifts", ["Open campaign schedule management", "Add a new shift", "Edit shift time or slot count", "Delete an unused shift"], "Shift list is updated and schedule reflects add/edit/delete actions.", "Campaign is owned by charity and selected shift has no registered volunteer when deleting"),
      tc("TC80", "Reject deleting shift with registered volunteer", ["Open campaign schedule management", "Select shift with pending or assigned volunteer", "Click Delete Shift"], "System blocks deletion and keeps the shift unchanged.", "Shift already has volunteer registration or assignment"),
      tc("TC81", "Manage campaign menu and meal type", ["Open campaign menu management", "Add menu item", "Assign breakfast/lunch/dinner meal type", "Remove unused menu item"], "Menu list and meal type are updated for the campaign.", "Campaign is owned by charity"),
      tc("TC82", "Set dish step scheduled times", ["Open campaign menu item detail", "Enter scheduled times for four dish steps", "Save step times"], "Four dish steps receive valid scheduled times and are shown in the kitchen task timeline.", "Menu item exists in the campaign"),
      tc("TC83", "Reject dish step completion without proof photo", ["Sign in as assigned volunteer", "Open available dish step", "Click Complete without attaching proof photo"], "System rejects the completion because proof photo is required.", "Dish step is available and volunteer is assigned to campaign"),
      tc("TC84", "Flag dish step QC failure", ["Sign in as assigned chef or waiter", "Open dish step detail", "Click QC Fail", "Enter failure reason and submit"], "Step is marked with QC failure reason and charity owner receives an urgent notification.", "Dish step belongs to an in-progress campaign"),
      tc("TC85", "Receiver submits meal feedback after handoff", ["Receiver opens received campaign meal history", "Select a completed handoff", "Submit rating and feedback"], "Feedback is saved once and appears in campaign beneficiary feedback summary without exposing receiver identity.", "Receiver has a completed campaign handoff"),
    ],
  },
  {
    sheetName: "Payment",
    tabName: "Bulk Notifications",
    title: "Bulk Notifications",
    requirement: "Bulk-run approval, stop serving, completion, and notification read states",
    cases: [
      tc("TC74", "Request bulk run with valid quantity", ["Sign in as verified shipper", "Open eligible listing", "Request bulk quantity of at least ten portions"], "Bulk run request is created with requested status.", "Listing has enough remaining quantity"),
      tc("TC75", "Reject bulk run below minimum quantity", ["Open bulk request", "Enter quantity below minimum", "Submit request"], "System displays minimum quantity validation error.", "Verified shipper is signed in"),
      tc("TC76", "Provider approves bulk run", ["Sign in as provider", "Open bulk request", "Click Approve"], "Stock is decremented atomically and bulk run status becomes approved.", "Provider owns listing and stock is sufficient"),
      tc("TC77", "Add and serve bulk distribution stop", ["Open picked-up bulk run", "Add distribution stop with location", "Log served portions"], "Stop is saved and served quantity is added without exceeding total quantity.", "Bulk run has been picked up"),
      tc("TC78", "Complete bulk run with leftover stock return", ["Open active bulk run", "Enter served quantity less than total", "Click Complete"], "Bulk run is completed and leftover portions return to listing stock.", "Bulk run is active"),
      tc("TC79", "Read notification and update unread count", ["Open notifications", "Click unread notification", "Return to list"], "Notification is marked as read and unread count decreases.", "User has unread notifications"),
    ],
  },
];

let sequentialCaseNo = 1;
for (const module of modules) {
  for (const testCase of module.cases) {
    testCase[0] = `TC${String(sequentialCaseNo).padStart(2, "0")}`;
    sequentialCaseNo += 1;
  }
}

const summaryCases = modules
  .flatMap((module) =>
    module.cases.map((testCase) => [
      testCase[1],
      module.tabName ?? module.sheetName,
      testCase[3],
      testCase[4],
    ]),
  )
  .map((row, index) => [index + 1, ...row]);

const summarySheetNameFormulas = modules
  .flatMap((module) => {
    const targetName = module.tabName ?? module.sheetName;
    const escapedTarget = targetName.replace(/'/g, "''");
    const escapedLabel = targetName.replace(/"/g, '""');
    return module.cases.map(() => [`=HYPERLINK("#'${escapedTarget}'!A1","${escapedLabel}")`]);
  });

function updateCover() {
  setValues("Cover", "B4:B5", [[projectName], [projectCode]]);
  setValues("Cover", "F4:F6", [[creator], [issueDate], [1]]);
  setFormulas("Cover", "B6", [[`=B5&"_v1.0"`]]);
  setValues("Cover", "A11:F16", [
    [issueDate, "1", "Test case", "M", "Adapt test case list for FoodResQ project", "v1.0"],
    [issueDate, "1", "Test Statistics", "M", "Adapt test statistics for FoodResQ project", "v1.0"],
    [issueDate, "1", "Module test sheets", "M", "Replace sample LMS modules with FoodResQ functional flows", "v1.0"],
    [issueDate, "1", "Environment", "M", "Update environment for NestJS, Next.js, React Native, PostgreSQL/PostGIS, Redis, and Socket.IO", "v1.0"],
    [issueDate, "1", "Traceability", "A", "Add reservation, delivery, bulk run, trust, and notification coverage", "v1.0"],
    [issueDate, "1", "Final review", "M", "Review formulas and exported workbook layout", "v1.0"],
  ]);
}

function updateTestCases() {
  const env = [
    "1. Backend: NestJS API Server",
    "2. Database: PostgreSQL + PostGIS",
    "3. Frontend: Next.js web portal and React Native mobile app",
    "4. Cache/Queue: Redis, BullMQ",
    "5. Realtime: Socket.IO",
    "6. File storage: S3/Cloudinary-compatible object storage",
    "7. Browser: Chrome, Edge",
  ].join("\n");

  const firstRow = 9;
  const lastRow = firstRow + summaryCases.length - 1;
  const ws = sheet("Test Cases");
  setValues("Test Cases", "D3:D5", [[projectName], [projectCode], [env]]);
  ws.unmergeCells("B9:F120");
  ws.getRange("B9:F120").clear({ applyTo: "contents" });
  setValues("Test Cases", `B${firstRow}:F${lastRow}`, summaryCases);
  setFormulas("Test Cases", `D${firstRow}:D${lastRow}`, summarySheetNameFormulas);
  ws.getRange(`B${firstRow}:F${lastRow}`).format = {
    fill: "#FFFFFF",
    font: { bold: false, italic: false, color: "#000000" },
    borders: { preset: "all", style: "thin", color: "#000000" },
    wrapText: true,
  };
  ws.getRange(`D${firstRow}:D${lastRow}`).format.font = { color: "#0000FF" };
}

function updateStatistics() {
  setValues("Test Statistics", "C3:C4", [[projectName], [projectCode]]);
  setValues("Test Statistics", "G3:G5", [[creator], [reviewer], [issueDate]]);
  setFormulas("Test Statistics", "C5", [[`=C4&"_Test Report_v1.0"`]]);

  const statsFormulas = modules.map((module, index) => {
    const rowNo = index + 1;
    const formulaSheetName = module.tabName ?? module.sheetName;
    const quoted = formulaSheetName.includes(" ") ? `'${formulaSheetName}'` : formulaSheetName;
    return [
      rowNo,
      `=${quoted}!B2`,
      `=${quoted}!B6`,
      `=${quoted}!C6`,
      `=${quoted}!D6`,
      `=${quoted}!E6`,
      `=${quoted}!B4`,
    ];
  });
  const firstStatRow = 11;
  const lastStatRow = firstStatRow + statsFormulas.length - 1;
  const ws = sheet("Test Statistics");
  ws.getRange("B11:H30").clear({ applyTo: "contents" });
  for (let row = firstStatRow; row <= lastStatRow; row += 1) {
    ws.getRange(`B${row}:H${row}`).copyFrom(ws.getRange("B11:H11"), "formats");
  }
  setValues("Test Statistics", `B${firstStatRow}:B${lastStatRow}`, statsFormulas.map((row) => [row[0]]));
  setFormulas("Test Statistics", `C${firstStatRow}:H${lastStatRow}`, statsFormulas.map((row) => row.slice(1)));
  setFormulas("Test Statistics", "D23:H23", [[`=SUM(D${firstStatRow}:D${lastStatRow})`, `=SUM(E${firstStatRow}:E${lastStatRow})`, `=SUM(F${firstStatRow}:F${lastStatRow})`, `=SUM(G${firstStatRow}:G${lastStatRow})`, `=SUM(H${firstStatRow}:H${lastStatRow})`]]);
  setFormulas("Test Statistics", "E25:E26", [["=(D23+E23)*100/(H23-G23)"], ["=D23*100/(H23-G23)"]]);
}

function updateModule(module) {
  const ws = sheet(module.sheetName);
  if (!originalSheetNames.has(module.sheetName)) {
    ws.getRange("A1:O80").copyFrom(sheet("Login").getRange("A1:O80"), "all");
    ws.name = module.sheetName;
  }
  ws.getRange("A11:O1005").clear({ applyTo: "contents" });
  setValues(module.sheetName, "B2:B3", [[module.title], [module.requirement]]);
  setValues(module.sheetName, "B4", [[module.cases.length]]);
  setValues(module.sheetName, "A5:E5", [["Testing Round", "Passed", "Failed", "Pending", "N/A"]]);
  setValues(module.sheetName, "A6:A8", [["Round 1"], ["Round 2"], ["Round 3"]]);
  setFormulas(module.sheetName, "B6:E8", [
    ['=COUNTIF($F$12:$F$1005,B$5)', '=COUNTIF($F$12:$F$1005,C$5)', '=COUNTIF($F$12:$F$1005,D$5)', '=COUNTIF($F$12:$F$1005,E$5)'],
    ['=COUNTIF($I$12:$I$1005,B$5)', '=COUNTIF($I$12:$I$1005,C$5)', '=COUNTIF($I$12:$I$1005,D$5)', '=COUNTIF($I$12:$I$1005,E$5)'],
    ['=COUNTIF($L$12:$L$1005,B$5)', '=COUNTIF($L$12:$L$1005,C$5)', '=COUNTIF($L$12:$L$1005,D$5)', '=COUNTIF($L$12:$L$1005,E$5)'],
  ]);
  setValues(module.sheetName, "A10:O10", [[
    "Test Case ID",
    "Test Case Description",
    "Test Case Procedure",
    "Expected Results",
    "Pre-conditions",
    "Round 1",
    "Test date",
    "Tester",
    "Round 2",
    "Test date",
    "Tester",
    "Round 3",
    "Test date",
    "Tester",
    "Note",
  ]]);
  const rows = moduleRows(module);
  const endRow = 10 + rows.length;
  setValues(module.sheetName, `A11:O${endRow}`, rows);
  applyModuleTemplateFormat(ws, endRow);
  for (let offset = 0; offset < rows.length; offset += 1) {
    const rowNumber = 11 + offset;
    const isSection = typeof rows[offset][0] === "string" && !rows[offset][0].startsWith("TC");
    if (isSection) {
      ws.getRange(`A${rowNumber}:O${rowNumber}`).format = {
        fill: "#CCFFFF",
        font: { name: "Tahoma", size: 10, bold: true, color: "#000000" },
        borders: { preset: "all", style: "thin", color: "#000000" },
        wrapText: true,
      };
      ws.getRange(`A${rowNumber}:O${rowNumber}`).format.rowHeight = 24;
    }
  }
  ws.getRange(`G12:G${endRow}`).setNumberFormat("yyyy-mm-dd");
  ws.getRange(`J12:J${endRow}`).setNumberFormat("yyyy-mm-dd");
  ws.getRange(`M12:M${endRow}`).setNumberFormat("yyyy-mm-dd");
}

function setColumnWidth(sheetName, column, width) {
  sheet(sheetName).getRange(`${column}1:${column}80`).format.columnWidth = width;
}

function applyReadabilityLayout() {
  for (const ws of ["Cover", "Test Cases", "Test Statistics", ...modules.map((module) => module.sheetName)]) {
    sheet(ws).getRange("A1:O80").format.wrapText = true;
  }

  setColumnWidth("Cover", "B", 42);
  setColumnWidth("Cover", "E", 22);
  setColumnWidth("Cover", "F", 24);
  sheet("Cover").getRange("A11:F16").format.rowHeight = 42;

  setColumnWidth("Test Cases", "C", 34);
  setColumnWidth("Test Cases", "D", 20);
  setColumnWidth("Test Cases", "E", 52);
  setColumnWidth("Test Cases", "F", 44);
  sheet("Test Cases").getRange(`B9:F${8 + summaryCases.length}`).format.rowHeight = 31;
  sheet("Test Cases").getRange("D5:F5").format.rowHeight = 115;

  setColumnWidth("Test Statistics", "C", 44);
  setColumnWidth("Test Statistics", "H", 28);
  sheet("Test Statistics").getRange("B11:H19").format.rowHeight = 30;

  for (const module of modules) {
    setColumnWidth(module.sheetName, "A", 14);
    setColumnWidth(module.sheetName, "B", 34);
    setColumnWidth(module.sheetName, "C", 58);
    setColumnWidth(module.sheetName, "D", 48);
    setColumnWidth(module.sheetName, "E", 38);
    setColumnWidth(module.sheetName, "G", 13);
    setColumnWidth(module.sheetName, "J", 13);
    setColumnWidth(module.sheetName, "M", 13);
    sheet(module.sheetName).getRange("A12:O100").format.rowHeight = 118;
    sheet(module.sheetName).getRange("B2:E3").format.rowHeight = 42;
    const rows = moduleRows(module);
    for (let offset = 0; offset < rows.length; offset += 1) {
      const rowNumber = 11 + offset;
      const isSection = typeof rows[offset][0] === "string" && !rows[offset][0].startsWith("TC");
      if (isSection) {
        sheet(module.sheetName).getRange(`A${rowNumber}:O${rowNumber}`).format.rowHeight = 24;
      }
    }
  }
}

function renameFeatureSheets() {
  for (const module of modules) {
    const targetName = module.tabName ?? module.sheetName;
    if (targetName !== module.sheetName) {
      sheet(module.sheetName).name = targetName;
    }
  }
}

updateCover();
updateTestCases();
for (const module of modules) updateModule(module);
applyReadabilityLayout();
renameFeatureSheets();
updateStatistics();

await fs.mkdir(previewDir, { recursive: true });
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
await fs.writeFile(path.join(outputDir, "formula-errors.ndjson"), errors.ndjson, "utf8");

const keyRanges = await workbook.inspect({
  kind: "table,formula",
  sheetId: "Test Statistics",
  range: "B10:H26",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 8,
  maxChars: 12000,
});
await fs.writeFile(path.join(outputDir, "statistics-check.ndjson"), keyRanges.ndjson, "utf8");

for (const ws of ["Cover", "Test Cases", "Test Statistics", ...modules.map((module) => module.tabName ?? module.sheetName)]) {
  const preview = await workbook.render({ sheetName: ws, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(previewDir, `${ws.replace(/[\\/:*?"<>|]/g, "_")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
