const config = require('config');

function envVar(key) {
    try {
        key = key.toUpperCase();

        return process.env[key] || config.get(key);
    }
    catch (e) {
        return null;
    }
}

function getDBconnectionParams(dbKey = null) {
    const dbProtocol = envVar("DB_PROTOCOL");
    if (dbProtocol) {
        const dbUser = envVar("DB_USER");
        const dbPassword = envVar("DB_PASSWORD");
        const dbHost = envVar("DB_HOST");
        const dbPort = envVar("DB_PORT");
        const dbName = envVar("DB_NAME");

        return {
            protocol: dbProtocol,
            user: dbUser,
            password: dbPassword,
            host: dbHost,
            port: dbPort,
            dbname: dbName
        }
    }
    else {
        const dbConnectionKey = envVar("DB_CONNECTION_KEY");

        let returnValue = envVar(dbKey ? dbKey : dbConnectionKey);

        if (typeof returnValue === "object") {
            let newObj = {};
            for (const key of Object.keys(returnValue)) {
                newObj[key] = returnValue[key].replaceAll('{~}', '');
            }

            return newObj;
        }
        else
            return returnValue;
    }
}

function getDBconnectionString(dbKey = null) {
    const { protocol, user = "", password = "", host, port = "", dbname } = getDBconnectionParams(dbKey);

    let connectionStr = `${protocol}://`;

    if (user)
        connectionStr += `${user}:${password}@`;

    connectionStr += `${host}`;

    if (port)
        connectionStr += `:${port}`;

    connectionStr += `/${dbname}`;

    connectionStr = connectionStr.replaceAll('{~}', '');

    return connectionStr;
}

module.exports = {
    envVar,
    getDBconnectionParams,
    getDBconnectionString
}
