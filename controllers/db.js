const { getDbAvailable, db } = require('../services/db');

class dbController {
    constructor() {
    }

    async available(req, res) {
        try {
            if (getDbAvailable().success)
                res.status(200).json(getDbAvailable())
            else {
                getDbAvailable().message = dbAvailable.message ?? "Database is not available.";
                res.status(500).json(getDbAvailable())
            }
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }

    async create(req, res) {
        try {
            if (getDbAvailable().success) {
                await db.initTables(true);
                res.status(200).json(getDbAvailable())
            }
            else {
                getDbAvailable().message = dbAvailable.message ?? "Database is not available.";
                res.status(500).json(getDbAvailable())
            }
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }
}

module.exports = new dbController();
