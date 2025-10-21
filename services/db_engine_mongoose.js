const mongoose = require('mongoose');
const UserModel = require('../models/mongoose_user');
const SettingModel = require('../models/mongoose_setting');
const DB_BASE = require('./db_engin_base');

class MONGOOSE_DB extends DB_BASE {
    constructor() {
        super();
        this.client = null;
    }

    async enginConnect(dbUri) {
        await mongoose.connect(dbUri);
    }

    async createTables() {
        const collections = await mongoose.connection.db.collections()
        const tableNames = collections.map(c => c.collectionName);

        if (!tableNames.includes('users')) {
            await this.createTable(UserModel);
        }

        if (!tableNames.includes('settings')) {
            await this.createTable(SettingModel);
        }

        const usersCount = await mongoose.connection.db.collection('users').countDocuments();
        if (usersCount === 0)
            await this.insertData();            
    }

    async createTable(model) {
        console.log(await this.removeCollection(model));
        console.log(await this.createCollection(model));
    }

    async initTables(recreateTables) {
        try {
            if (recreateTables) {
                console.log(await this.removeCollection(UserModel));
                console.log(await this.removeCollection(SettingModel));

                console.log(await this.createCollection(UserModel));
                console.log(await this.createCollection(SettingModel));

                await this.insertData();
            }

            return { success: true, message: 'All tables created successfully' };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async createCollection(model) {
        try {
            const result = await model.createCollection();

            return { success: true, message: `Collection ${result.name} was created.` }
        }
        catch (e) {
            return { success: false, message: e.message }
        }
    }

    async removeCollection(model) {
        try {
            const collectionName = model.collection.collectionName;
            
            await mongoose.connection.db.dropCollection(collectionName);

            return { success: true, message: `Collection ${collectionName} was removed.` }
        }
        catch (e) {
            return { success: false, message: e.message }
        }
    }

    async insertData() {
        const password = await this.hashPassword("1234");

        const adminData = {
            'name': 'Admin',
            'email': 'admin@admin.com',
            'password': password,
            'role': 'Admin',
            'editable': false,
            'protected': true
        };

        await this.insertRecord(UserModel, adminData);

        const editorData = {
            'name': 'Editor',
            'email': 'editor@editor.com',
            'password': password,
            'role': 'Editor',
            'editable': false,
            'protected': true
        };

        await this.insertRecord(UserModel, editorData);
    }

    async insertRecord(model, data) {
        try {
            const result = await model.create(data);

            return { success: true, message: `Data saved into collection ${model.name}`, result };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async updateRecord(model, _id, fieldName, data) {
        try {
            const filter = { _id: _id };
            const update = {
                $set: { [fieldName]: data },
            };

            const result = await model.updateOne(filter, update);

            return { success: true, message: `Data saved into collection ${model.name}` };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async login(email, password) {
        try {
            const user = await UserModel.findOne(
                { email: email }
            );

            if (user) {
                const correctPassword = user.password ? (await this.comparePassword(password, user.password) || (password === user.password)) : false;

                if (correctPassword) {
                    return { success: true, data:user.toJSON()}
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
            if (!user || !user._id)
                return { success: false, message: "Unknown user." }

            const result = await SettingModel.findOne(
                {user_id: user._id}
            );

            if (result) {
                if (result?.data)
                    return { success: true, data: result.data }
            }

            return { success: false, message: "User settings not found." }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async saveSettings(data, user) {
        try {
            if (!user || !user._id)
                return { success: false, message: "Unknown user." }

            const result = await SettingModel.findOne(
                {user_id: user._id}
            );

            if (result) {
                await this.updateRecord(SettingModel, result._id, 'data', data);
            }
            else {
                const user_id = user._id;
                await this.insertRecord(SettingModel, {user_id, data});
            }

            return { success: true, data: data };
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async deleteSettings(userId) {
        try {
            await SettingModel.deleteOne(
                { user_id: userId }
            );

            return { success: true }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async getAllUsers() {
        try {
            const users = await UserModel.find({});

            return { success: true, data:users }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async getProtectedUsers() {
        try {
            const users = await UserModel.find({ protected: true });

            return { success: true, data:users }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async addUser(data) {
        try {
            // check if email exist
            const user = await UserModel.findOne(
                { email: data.email }
            );

            if (user)
                return { success: false, message:"Email already exist in system." }

            data.password = await this.hashPassword(data.password);
            data.editable = true;
            data.protected = false;

            const newUser = await this.insertRecord(UserModel, data);
            data.id = newUser.result.id;

            return { success: true, data:data }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }

    async deleteUser(email) {
        try {
            const user = await UserModel.findOne({ email: email });
            
            const userId = user._id.toString();

            await UserModel.deleteOne(
                { email: email }
            );

            await this.deleteSettings( userId );

            return { success: true }
        }
        catch (e) {
            return { success: false, message: e.message };
        }
    }
}

module.exports = MONGOOSE_DB
