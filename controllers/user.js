const { db } = require('../services/db');
const { deleteUserMoviesFolder } = require('../services/movies');
const storage = require('../services/storage');

class userController {
    constructor() {
    }

    async all(req, res) {
        try {
            const result = await db.getAllUsers();

            if (result.success)
                res.status(200).json(result)
            else {
                result.message = result.message ?? "Get users failed.";
                res.status(500).json(result)
            }
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }

    async protected(req, res) {
        try {
            const result = await db.getProtectedUsers();

            if (result.success)
                res.status(200).json(result)
            else {
                result.message = result.message ?? "Get users failed.";
                res.status(500).json(result)
            }
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }

    async add(req, res) {
        try {
            const data = req.body;

            const result = await db.addUser(data);

            if (result.success)
                res.status(200).json(result)
            else {
                result.message = result.message ?? "Add user failed.";
                res.status(500).json(result)
            }
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }

    async delete(req, res) {
        try {
            const { user } = req.body;

            let result = await db.deleteUser(user.email);

            if (result.success) {
                
                result = await deleteUserMoviesFolder(user.id);
                if (result.success) {
                    res.status(200).json(result)
                }
                else {
                    result.message = result.message ?? "Delete user movies folder failed.";
                    res.status(500).json(result)
                }
            }
            else {
                result.message = result.message ?? "Delete user failed.";
                res.status(500).json(result)
            }
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }
}

module.exports = new userController();
