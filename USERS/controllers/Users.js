import sql from 'mssql';
import USERModel from '../model/USER.js';

export default class USERController {
    constructor() { }

    static async getUsuariosBymanager(conection, req, res) {
        const UserID = req.body.UserID;
        let query_where = '';
        await sql.connect(conection);
        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            const usersIds =  await USERModel.GetUserIdByManager(transaction, UserID);
            if (usersIds.length > 0) {
                for (let i = 0; i < usersIds.length; i++) {
                    query_where += `manager = '${usersIds[i].UserID}'`
                    if (i < usersIds.length - 1)
                        query_where += ` or `
                }
            }
            const userNames = await USERModel.GetUserNameByManager(transaction, UserID, query_where);
            await transaction.commit();
            res.send({ result: 1, users: userNames })

        } catch (error) {
            await transaction.rollback();
            res.send({ result: 0 })
        }
    
    }}
