const mysql = require('mysql2/promise');
const DB_BASE = require('./db_engin_base');
const { getDBconnectionParams } = require('./env')

class MYSQL_DB extends DB_BASE {
    constructor() {
        super();
        this.connection = null;
    }

    async ensureDBexist() {
        const { user, password, host, port, dbname } = getDBconnectionParams();

        // Connect to MySQL server without specifying a database
        const connection = await mysql.createConnection({ host, user, password, port });

        // Create the database/schema if it doesn’t exist
        const sql = `
            CREATE DATABASE IF NOT EXISTS ${dbname} 
            CHARACTER SET utf8mb4 
            COLLATE utf8mb4_unicode_ci;
        `;
        await connection.query(sql);

        console.log(`Database/schema "${dbname}" exist/created`);

        await connection.end();
    }

    async enginConnect(dbUri) {
        this.connection = await mysql.createConnection(dbUri);
    }

    async createTables() {
        const cond = ' IF NOT EXISTS ';

        console.log(await this.createTable('users', cond));
        console.log(await this.createTable('settings', cond));

        const [rows] = await this.connection.execute('SELECT COUNT(*) total FROM users');
        if (rows[0].total === 0)
            this.insertData();
    }

    async createTable(tableName, cond) {
        try {
            let sql = '';

            switch (tableName) {
                case 'users':
                    sql = `
                        CREATE TABLE ${cond} users (
                            id INT UNSIGNED auto_increment primary key,
                            name VARCHAR(50) NOT NULL,
                            email VARCHAR(50) NOT NULL,
                            password VARCHAR(100) NOT NULL,
                            role VARCHAR(20) NOT NULL,
                            editable BOOLEAN NOT NULL DEFAULT FALSE,
                            protected BOOLEAN NOT NULL DEFAULT TRUE
                        )
                    `;
                    break;

                case 'settings':
                    sql = `
                        CREATE TABLE ${cond} settings (
                            id INT UNSIGNED auto_increment primary key,
                            user_id INT UNSIGNED NOT NULL,
                            data JSON NOT NULL,
                            FOREIGN KEY (user_id) REFERENCES users(id) 
                        )
                    `;
                    break;
            }

            const result = await this.connection.execute(sql);

            return { success: true, message: `Table ${tableName} was created.` }
        }
        catch (e) {
            return { success: false, message: e.message }
        }
    }

    async removeTable(tableName) {
        try {
            let result = await this.connection.execute(`DROP TABLE IF EXISTS ${tableName}`);

            return { success: true, message: `Table ${tableName} was removed.` }
        }
        catch (e) {
            return { success: false, message: e.message }
        }
    }

    async initTables(recreateTables) {
        try {
            if (recreateTables) {
                console.log(await this.removeTable('settings'));
                console.log(await this.removeTable('users'));

                console.log(await this.createTable('users', ''));
                console.log(await this.createTable('settings', ''));

                await this.insertData();
            }

            return { success: true, message: 'All associations initialized and tables created successfully' };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async insertData() {
        const password = await this.hashPassword("1234");

        const sql = `
            INSERT INTO users 
            (name, email, password, role, editable, protected)
            VALUES 
                ('Admin', 'admin@admin.com', '${password}', 'Admin', '0', '1'),
                ('Editor', 'editor@editor.com', '${password}', 'Editor', '0', '1')
            ;
        `;

        const result = await this.connection.execute(sql);
    }

    async login(email, password) {
        try {
            const [rows] = await this.connection.execute(`SELECT * FROM users WHERE email = '${email}'`)

            if (rows.length > 0) {
                const user = rows[0];

                const userPassword = user.password;
                const correctPassword = userPassword ? (await this.comparePassword(password, userPassword) || (password === userPassword)) : false;

                if (correctPassword) {
                    return { success: true, data: user }
                }
            }

            return { success: false };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async getSettings(user) {
        try {
            if (!user || !user.id)
                return { success: false, message: "Unknown user." }

            const [rows] = await this.connection.execute(`SELECT * FROM settings WHERE user_id = '${user.id}'`);

            if (rows.length > 0) {
                return { success: true, data: rows[0].data }
            }

            return { success: false, message: "User settings not found." }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async saveSettings(data, user) {
        try {
            if (!user || !user.id)
                return { success: false, message: "Unknown user." }

            const [rows] = await this.connection.execute(`SELECT * FROM settings WHERE user_id = '${user.id}'`);

            if (rows.length > 0) {
                const id = rows[0].id;
                const result = await this.connection.execute(`UPDATE settings SET data = '${JSON.stringify(data)}' WHERE user_id = '${user.id}'`);
            }
            else {
                const sql = `
                        INSERT INTO settings 
                        (user_id, data)
                        VALUES ('${user.id}', '${JSON.stringify(data)}');
                    `;

                const result = await this.connection.execute(sql);
            }

            return { success: true, data: data };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async deleteSettings(userId) {
        try {
            const result = await this.connection.execute(`DELETE FROM settings WHERE user_id = '${userId}'`);

            return { success: true }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async getAllUsers() {
        try {
            const [rows] = await this.connection.execute(`SELECT * FROM users`);

            return { success: true, data: rows }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async getProtectedUsers() {
        try {
            const [rows] = await this.connection.execute(`SELECT * FROM users WHERE protected = '1'`);

            return { success: true, data: rows }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async addUser(data) {
        try {
            // check if email exist
            const [rows] = await this.connection.execute(`SELECT * FROM users WHERE email = '${data.email}'`)

            if (rows.length > 0)
                return { success: false, message: "Email already exist in system." }

            data.password = await this.hashPassword(data.password);

            const sql = `
                    INSERT INTO users 
                    (name, email, password, role, editable, protected)
                    VALUES ('${data.name}', '${data.email}', '${data.password}', '${data.role}', '1', '0');
                `;
            const [result] = await this.connection.execute(sql);
            data.id = result.insertId;

            return { success: true, data: data }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async deleteUser(email) {
        try {
            // check if email exist
            const [rows] = await this.connection.execute(`SELECT * FROM users WHERE email = '${email}'`)

            if (rows.length > 0) {
                const user = rows[0];

                let result = await this.connection.execute(`DELETE FROM settings WHERE user_id = '${user.id}'`)
                result = await this.connection.execute(`DELETE FROM users WHERE id = '${user.id}'`)
            }

            return { success: true }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
}

module.exports = MYSQL_DB
