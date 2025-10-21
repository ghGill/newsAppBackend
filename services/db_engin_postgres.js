const User = require('../models/user')
const Setting = require('../models/setting')
const DB_BASE = require('./db_engin_base');
const { getDBconnectionParams } = require('./env')
const { Client } = require('pg');

class PG_DB extends DB_BASE {
    constructor() {
        super();
    }

    async ensureDBexist() {
        const { user, password, host, port, dbname } = getDBconnectionParams();

        const client = new Client({
            user: user,
            password: password,
            host: host,
            port: port,
            database: "postgres"
        });

        await client.connect();

        try {
            await client.query(`CREATE DATABASE "${dbname}"`);

            console.log(`Database "${dbname}" created`);
        }
        catch (err) {
            if (err.code === "42P04") {
                // already exists
                console.log(`Database "${dbname}" already exists, skipping.`);
            } else {
                throw err;
            }
        } finally {
            await client.end();

            // this code must run only after db exist or created
            const seqClient = require('./sequelizeClient');
            this.client = seqClient;
        }
    }

    async enginConnect(dbUri) {
        await this.client.authenticate();
    }

    async createDB() {
        await this.client.sync({ force: false });  // create all tables from models

        const count = await User.count();
        if (count === 0)
            this.insertData();
    }

    async createTables() {
        await this.client.sync({ force: false });  // create all tables from models

        const count = await User.count();
        if (count === 0)
            this.insertData();
    }

    async initTables(recreateTables) {
        try {
            if (recreateTables) {
                await this.client.sync({ force: true });  // create all tables from models
                await this.insertData();
            }
            else {
                await this.initializeAssociations();
            }

            return { success: true, message: 'All associations initialized and tables created successfully' };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async initializeAssociations() {
        // Initialize associations between models
        User.hasMany(Setting, {
            foreignKey: 'user_id',
            onDelete: 'CASCADE',
            hooks: true
        });

        Setting.belongsTo(User, {
            foreignKey: 'user_id',
            onDelete: 'CASCADE',
            as: 'st'
        });
    }

    async insertData() {
        const password = await this.hashPassword("1234");

        let adminData = {
            "id": 1,
            "name": "Admin",
            "email": "admin@admin.com",
            "password": password,
            "role": "Admin",
            "editable": false,
            "protected": true
        }

        await this.insertRecord(User, adminData);

        let editorData = {
            "id": 2,
            "name": "Editor",
            "email": "editor@editor.com",
            "password": password,
            "role": "Editor",
            "editable": false,
            "protected": true
        }

        await this.insertRecord(User, editorData);
    }

    async insertRecord(model, data) {
        const now = new Date();
        data.createdAt = now;
        data.updatedAt = now;

        const result = await model.create(data);

        return result;
    }

    async updateRecord(model, data) {
        const now = new Date();
        data.updatedAt = now;

        const result = await model.update(
            data,
            {
                where: { id: data.id },
            },
        );

        return result;
    }

    async login(email, password) {
        try {
            const user = await User.findOne(
                { where: { email: email } }
            );

            if (user) {
                const userPassword = user?.dataValues?.password;

                const correctPassword = user.password ? (await this.comparePassword(password, user.password) || (password === userPassword)) : false;

                if (correctPassword) {
                    return { success: true, data: user.dataValues }
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

            const result = await Setting.findOne(
                { where: { user_id: String(user.id) } }
            );

            if (result) {
                if (result?.dataValues?.data) {
                    return { success: true, data: result.dataValues.data }
                }
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

            const user_id = String(user.id);

            const result = await Setting.findOne(
                { where: { user_id: user_id } }
            );

            if (result) {
                const id = result.dataValues.id;
                await this.updateRecord(Setting, { id, data });
            }
            else {
                await this.insertRecord(Setting, { user_id, data });
            }

            return { success: true, data: data };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async deleteSettings(userId) {
        try {
            await Setting.destroy(
                { where: { user_id: String(userId) } }
            );

            return { success: true }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async getAllUsers() {
        try {
            const users = await User.findAll({});

            return { success: true, data: users }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async getProtectedUsers() {
        try {
            const users = await User.findAll(
                { where: { protected: true } }
            );

            return { success: true, data: users }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async addUser(data) {
        try {
            // check if email exist
            const user = await User.findOne(
                { where: { email: data.email } }
            );

            if (user)
                return { success: false, message: "Email already exist in system." }

            data.password = await this.hashPassword(data.password);
            data.editable = true;
            data.protected = false;

            const newUser = await this.insertRecord(User, data);
            
            data.id = newUser.id;

            return { success: true, data: data }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async deleteUser(email) {
        try {
            await User.destroy(
                { where: { email: email } }
            );

            return { success: true }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
}

module.exports = PG_DB
