var FILE_NAME = "cultural-facility-book.txt";
var FOLDER_ID = ""; // optional: paste a Drive folder id

function doGet(e) {
  var book = readBook_();
  var body = JSON.stringify(book);
  var callback = e && e.parameter ? e.parameter.callback : "";
  if (callback && /^[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + body + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var raw = "";
  if (e && e.parameter && e.parameter.payload) raw = e.parameter.payload;
  else if (e && e.postData && e.postData.contents) raw = e.postData.contents;
  var book = JSON.parse(raw);
  if (!book || book.schemaVersion !== 1 || !Array.isArray(book.accounts)) {
    return ContentService.createTextOutput("bad").setMimeType(ContentService.MimeType.TEXT);
  }
  writeBook_(book);
  return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
}

function readBook_() {
  var file = findFile_();
  if (!file) {
    return {
      schemaVersion: 1,
      facility: {
        name: "Samantha Smith Elementary Gym",
        address: "23305 NE 14th St, Sammamish, WA 98074",
        mapsUrl: "https://share.google/C8C33ynszqGr7fR40",
        sessionCost: 70,
        sessionHours: 3
      },
      settings: { defaultMaxSlotsPerGroup: 4 },
      accounts: [],
      events: [],
      sessions: [],
      groups: [],
      bookings: [],
      log: [],
      lastWriteId: ""
    };
  }
  return JSON.parse(file.getBlob().getDataAsString());
}

function writeBook_(book) {
  var file = findFile_();
  var text = JSON.stringify(book);
  if (file) {
    file.setContent(text);
    return;
  }
  var folder = FOLDER_ID ? DriveApp.getFolderById(FOLDER_ID) : DriveApp.getRootFolder();
  folder.createFile(FILE_NAME, text, MimeType.PLAIN_TEXT);
}

function findFile_() {
  var it;
  if (FOLDER_ID) {
    it = DriveApp.getFolderById(FOLDER_ID).getFilesByName(FILE_NAME);
  } else {
    it = DriveApp.getFilesByName(FILE_NAME);
  }
  return it.hasNext() ? it.next() : null;
}
