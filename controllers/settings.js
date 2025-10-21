const { db } = require('../services/db');
const { getMoviesList } = require('../services/movies')
const { getUserId } = require('../services/user');
const storage = require('../services/storage');

class settingsController {
    constructor() {
    }

    static async getSettingsFromDB(req, user) {
        try {
            const result = await db.getSettings(user);

            // get the movies files list from server folder
            const serverMoviesList = await getMoviesList(getUserId(user));

            let serverMoviesNames = [];
            let serverMoviesInfo = {};
            serverMoviesList.forEach(f => {
                serverMoviesNames.push(f.name);
                serverMoviesInfo[f.name] = {subFolder:f.subFolder, url:f.url};
            });

            if (result.success) {
                // get the saved movies list
                const settingsMovies = result.data.movies.map(item => item.file_name);

                // get the movies files list that were removed from server folder since last save 
                const missingFiles = settingsMovies.filter(f => !serverMoviesNames.includes(f));

                // find the new files that added to server folder
                const newFiles = serverMoviesNames.filter(f => !settingsMovies.includes(f));

                // create the updated movies list 
                // get only the saved files that are still exists in server folder (ignore the removed files)
                let finalSettingsMoviesList = result.data.movies.filter(item => !missingFiles.includes(item.file_name));

                // add the new movies files
                newFiles.forEach(f => {
                    finalSettingsMoviesList.push({
                        file_name: f,
                    });
                })

                // add the full url for each movie file
                finalSettingsMoviesList.forEach(f => {
                    f.deletable = (serverMoviesInfo[f.file_name].subFolder !== null);
                    f.url = serverMoviesInfo[f.file_name].url;
                    f.subFolder = serverMoviesInfo[f.file_name].subFolder;
                })

                result.data.movies = finalSettingsMoviesList;

                return result;
            }
            else {
                // in case there is no saved settings, return also the server movies files
                const folderFilesList = serverMoviesList.map(f => ({
                    file_name: f.name,
                    url: f.url,
                    deletable: f.deletable,
                    subFolder: f.subFolder
                }));

                result.movies = folderFilesList;
                result.message = result.message ?? "Get settings failed.";

                return result;
            }
        }
        catch (e) {
            return { success:false, message: e.message};
        }
    }

    async getSettings(req, res) {
        const user = req.user?? null; 

        const result = await settingsController.getSettingsFromDB(req, user);

        if (result.success) {
            res.status(200).json(result)
        }
        else {
            res.status(500).json(result)
        }
    }

    async getUserSettings(req, res) {
        const user = req.body; 

        const result = await settingsController.getSettingsFromDB(req, user);

        if (result.success) {
            res.status(200).json(result)
        }
        else {
            res.status(500).json(result)
        }
    }

    async saveSettings(req, res) {
        try {
            const data = req.body;

            const result = await db.saveSettings(data, (req.user?? null));

            if (result.success)
                res.status(200).json(result)
            else
                res.status(500).json(result)
        }
        catch (e) {
            res.status(500).json({ success: true, message: e.message })
        }
    }
}

module.exports = new settingsController();
