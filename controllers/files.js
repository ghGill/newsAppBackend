const { deleteMovieFile } = require('../services/movies');
const storage = require('../services/storage');

class filesController {
    constructor() {
    }

    async presign(req, res) {
        try {
            const result = await storage.getPresignUrl(req, res);

            if (result.success)
                res.status(200).json(result)
            else
                res.status(500).json(result)
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }

    async upload(req, res) {
        try {
            const result = await storage.uploadFile(req, res);

            if (result.success)
                res.status(200).json(result)
            else
                res.status(500).json(result)
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }

    async delete(req, res) {
        const { fileName, subFolder } = req.body;

        try {
            const result = await deleteMovieFile(fileName, subFolder);

            if (result.success) {
                res.status(200).json(result)
            }
            else {
                res.status(500).json(result)
            }
        }
        catch (e) {
            res.status(500).json({ success: false, message: e.message })
        }
    }
}

module.exports = new filesController();
