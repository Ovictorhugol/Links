// Both adapters expose the same async account operations. SQLite remains available for local tests.
export function accounts(target) {
  if(typeof target.prepare !== 'function')return target;
  return {
    hasAdmins:() => !!target.prepare('SELECT username FROM admins LIMIT 1').get(),
    getAdmin:username => target.prepare('SELECT username, password_hash FROM admins WHERE username = ?').get(username),
    insertDefaultAdmin:hash => target.prepare('INSERT INTO admins (username, password_hash) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM admins)').run('admin',hash).changes > 0,
    upsertAdmin:(username,hash) => target.prepare('INSERT INTO admins VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash').run(username,hash),
    deleteUserSessions:username => target.prepare('DELETE FROM sessions WHERE username = ?').run(username),
    saveSession:(hash,username,csrf,expires) => {
      target.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      target.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hash,username,csrf,expires);
    },
    findSession:hash => target.prepare('SELECT username, csrf FROM sessions WHERE token_hash = ? AND expires > ?').get(hash,Date.now()) || null,
    deleteSession:hash => target.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash),
  };
}
