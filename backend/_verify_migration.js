const db = require("./database");
const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
console.log("users columns:", cols);
const rows = db.prepare("SELECT username, allowed_grades, full_name, bio, avatar_url FROM users LIMIT 3").all();
console.log("sample users:", JSON.stringify(rows, null, 2));
db.close();
