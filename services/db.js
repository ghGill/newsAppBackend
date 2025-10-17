const { envVar } = require('../services/env');

let db_engin_class = null;
let dbAvailable = null;

switch (envVar("DB_ENGINE_TYPE")) {
    case 'MONGO':
        db_engin_class = require('./db_engin_mongo')
        break;

    case 'MONGOOSE':
        db_engin_class = require('./db_engine_mongoose')
        break;

    case 'POSTGRES':
        db_engin_class = require('./db_engin_postgres')
        break;

    case 'MYSQL':
        db_engin_class = require('./db_engin_mysql')
        break;
}
const db = new db_engin_class();

function getDbAvailable() {
    return dbAvailable;
}

async function initDB() {
    return new Promise(async (resolve, reject) => {
        try {
            dbAvailable = await db.connect();
            dbAvailable.git_info = {
                branch: envVar('BACKEND_GIT_BRANCH') || "Unknown", 
                commit:envVar('BACKEND_GIT_COMMIT') || "Unknown"
            };
            
            const msg = dbAvailable.success ? "DB connection is available." : `DB connection failed. {${dbAvailable.message}}`;
            console.log(msg);
            resolve({ success: true, message: msg});
        }
        catch (e) {
            reject({ success: false, message: e.message })
        }
    })
}

module.exports = {
    db,
    getDbAvailable,
    initDB
};
