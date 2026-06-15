// ════════════════════════════════════════════
// ExportSpace — Google Apps Script v3
// เพิ่ม: File Upload → Google Drive
// ════════════════════════════════════════════

const SPREADSHEET_ID  = SpreadsheetApp.getActiveSpreadsheet().getId();
const ALLOWED_DOMAIN  = 'vanachai.com';
const DRIVE_FOLDER_ID   = '1WG2C7jodY4ta6c8ECeevXcujTsO1wfRk'; // folder ID ที่กำหนด
const SHEETS = { Posts:'Posts', Board:'Board', Links:'Links', Events:'Events', Users:'Users' };

// ════════════════════════════════════════════
// ENTRY POINTS
// ════════════════════════════════════════════
function doGet(e) {
  const p      = e.parameter || {};
  const action = p.action || 'get';
  const sheet  = p.sheet  || 'Posts';
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    let result;
    if      (action === 'ping')      result = { pong: true };
    else if (action === 'get')       result = getRows(sheet, p);
    else if (action === 'create')    result = createRow(sheet, p);
    else if (action === 'update')    result = updateRow(sheet, p);
    else if (action === 'delete')    result = deleteRow(sheet, p);
    else if (action === 'like')      result = likePost(p.id);
    else if (action === 'whoami')    result = whoAmI();
    else if (action === 'getFolder') {
      const f = getOrCreateFolder();
      result = { folderId: f.getId(), folderName: f.getName() };
    }
    else                             result = { error: 'unknown action: ' + action };

    output.setContent(JSON.stringify({ status:'ok', data:result }));
  } catch (err) {
    output.setContent(JSON.stringify({ status:'error', message:err.message }));
  }
  return output;
}

// ── doPost — รับไฟล์ upload ──
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try {
    const p    = e.parameter || {};
    const data = e.postData?.contents;

    if (p.action === 'upload' && data) {
      const json    = JSON.parse(data);
      const result  = uploadFileToDrive(json.filename, json.mimeType, json.base64);
      output.setContent(JSON.stringify({ status:'ok', data: result }));
    } else {
      output.setContent(JSON.stringify({ status:'error', message:'invalid upload request' }));
    }
  } catch(err) {
    output.setContent(JSON.stringify({ status:'error', message: err.message }));
  }
  return output;
}

// ════════════════════════════════════════════
// GOOGLE DRIVE — อัปโหลดและจัดการไฟล์
// ════════════════════════════════════════════

// ใช้ folder ID ที่กำหนดไว้โดยตรง
function getOrCreateFolder() {
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  return folder;
}

// อัปโหลดไฟล์ base64 → Drive → คืน URL
function uploadFileToDrive(filename, mimeType, base64Data) {
  const folder  = getOrCreateFolder();
  const decoded = Utilities.base64Decode(base64Data);
  const blob    = Utilities.newBlob(decoded, mimeType, filename);
  const file    = folder.createFile(blob);

  // ตั้งให้ anyone สามารถดูได้
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId    = file.getId();
  // thumbnail URL — แสดงได้ตรงใน img tag
  const thumbUrl  = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
  // ลิงก์เปิดดู
  const viewUrl   = `https://drive.google.com/file/d/${fileId}/view`;
  // direct link (รูปภาพ)
  const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;

  return {
    fileId,
    filename,
    mimeType,
    thumbUrl,
    viewUrl,
    directUrl,
    folderId: folder.getId(),
    folderName: DRIVE_FOLDER_NAME,
  };
}

// ════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════
function whoAmI() {
  const email = Session.getActiveUser().getEmail();
  if (!email) return { guest: true };

  const sheet = getOrCreateSheet(SHEETS.Users, ['email','name','dept','role','last_seen']);
  const rows  = sheetToArray(sheet);
  const idx   = rows.findIndex(r => r.email === email);
  const now   = new Date().toISOString();

  if (idx === -1) {
    sheet.appendRow([email, email.split('@')[0], 'Export & Logistics', 'member', now]);
  } else {
    sheet.getRange(idx + 2, 5).setValue(now);
  }

  return idx === -1
    ? { email, name: email.split('@')[0], dept:'Export & Logistics', role:'member' }
    : { ...rows[idx], last_seen: now };
}

// ════════════════════════════════════════════
// CRUD
// ════════════════════════════════════════════
function getRows(sheetName, p) {
  const sheet = getOrCreateSheet(sheetName, getHeaders(sheetName));
  const rows  = sheetToArray(sheet);
  if (p.id) return rows.filter(r => String(r.id) === String(p.id));
  return rows;
}

function createRow(sheetName, p) {
  const sheet   = getOrCreateSheet(sheetName, getHeaders(sheetName));
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const id      = Utilities.getUuid();
  const now     = new Date().toISOString();

  const row = headers.map(h => {
    if (h === 'id')         return id;
    if (h === 'created_at') return now;
    if (h === 'likes')      return '0';
    if (h === 'pinned')     return 'false';
    return p[h] !== undefined ? p[h] : '';
  });

  sheet.appendRow(row);
  const result = {};
  headers.forEach((h, i) => result[h] = row[i]);
  return result;
}

function updateRow(sheetName, p) {
  if (!p.id) throw new Error('id required');
  const sheet   = getOrCreateSheet(sheetName, getHeaders(sheetName));
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data    = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) {
      headers.forEach((h, ci) => {
        if (p[h] !== undefined && h !== 'id' && h !== 'created_at') {
          sheet.getRange(i + 1, ci + 1).setValue(p[h]);
        }
      });
      return { id: p.id, updated: true };
    }
  }
  throw new Error('Row not found: ' + p.id);
}

function deleteRow(sheetName, p) {
  if (!p.id) throw new Error('id required');
  const sheet = getOrCreateSheet(sheetName, getHeaders(sheetName));
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(p.id)) {
      sheet.deleteRow(i + 1);
      return { deleted: true, id: p.id };
    }
  }
  throw new Error('Row not found: ' + p.id);
}

function likePost(postId) {
  if (!postId) throw new Error('id required');
  const sheet   = getOrCreateSheet(SHEETS.Posts, getHeaders('Posts'));
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const likesCol = headers.indexOf('likes') + 1;
  const idCol    = headers.indexOf('id') + 1;
  if (likesCol < 1) throw new Error('likes column not found');

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol - 1]) === String(postId)) {
      const cur = parseInt(data[i][likesCol - 1]) || 0;
      sheet.getRange(i + 1, likesCol).setValue(cur + 1);
      return { likes: cur + 1 };
    }
  }
  throw new Error('Post not found: ' + postId);
}

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
function getHeaders(sheetName) {
  const map = {
    // เพิ่ม image_url ใน Posts สำหรับเก็บ URL รูป/ไฟล์
    Posts:  ['id','author','dept','content','tag','created_at','likes','image_url','file_name'],
    Board:  ['id','author','title','tag','priority','created_at','pinned'],
    Links:  ['id','name','url','type','created_by'],
    Events: ['id','title','date','description','priority'],
    Users:  ['email','name','dept','role','last_seen'],
  };
  return map[sheetName] || ['id','created_at'];
}

function getOrCreateSheet(name, headers) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight('bold')
         .setBackground('#0B2545')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetToArray(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = String(row[i] ?? ''));
      return obj;
    });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
