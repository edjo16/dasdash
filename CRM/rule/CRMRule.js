export default class CRMRule {
    static async validateIddevteam(iddevteam) {
        return ['lossa', 'rparra', 'dgutierrez'].includes(iddevteam)
    }

    static async validateUserID(UserID) {
        return ['lossa', 'rparra', 'dgutierrez'].includes(UserID)
    }

    static generateSirdataQueris(value, modulo) {
        const [principal, endoso] = value.split("-");
        let sqlQuerySelect = "";
        let sqlQueryUpdate = "";

        const queries = {
            "fac_Cover Note": {
                select: `SELECT cnota, cendoso, crm_id FROM sir_dnota WHERE cnota = ${principal}`,
                update: `UPDATE sir_dnota SET crm_id = crm_id WHERE cnota = ${principal} AND cendoso = ${endoso}`
            },
            "fac_Offers": {
                select: `SELECT cllamada, crm_id FROM sir_dllamada WHERE cllamada = ${principal}`,
                update: `UPDATE sir_dllamada SET crm_id = crm_id WHERE cllamada = ${principal}`
            },
            "fac_Claims Reserve": {
                select: `SELECT caviso, cn_stro, crm_id FROM sir_daper WHERE caviso = ${principal} AND cn_stro = ${endoso}`,
                update: `UPDATE sir_daper SET crm_id = crm_id WHERE caviso = ${principal} AND cn_stro = ${endoso}`
            },
            "fac_Claim Payment": {
                select: `SELECT caviso, cn_stro1, crm_id FROM sir_dcomp WHERE caviso = ${principal} AND cn_stro1 = ${endoso}`,
                update: `UPDATE sir_dcomp SET crm_id = crm_id WHERE caviso = ${principal} AND cn_stro1 = ${endoso}`
            },
            "treaty_Claims": {
                select: `SELECT idcontrol, cn_stro, crm_id FROM sir_crcpsinpend WHERE idcontrol = ${principal} AND cn_stro = ${endoso}`,
                update: `UPDATE sir_crcpsinpend SET crm_id = crm_id WHERE idcontrol = ${principal} AND cn_stro = ${endoso}`
            },
            "treaty_Remittances": {
                select: `SELECT cingreso, crm_id FROM sir_paingreso WHERE cingreso = '${principal}'`,
                update: `UPDATE sir_paingreso SET crm_id = crm_id WHERE cingreso = '${principal}'`
            },
            "treaty_Treaty": {
                select: `SELECT cncontrato, crm_id, 'crcp' AS tabla FROM sir_crcp WHERE cncontrato = '${principal}'
                          UNION
                          SELECT cncontrato, crm_id, 'crcnp' AS tabla FROM sir_crcnp WHERE cncontrato = '${principal}'`
            }
        };

        if (queries[modulo]) {
            sqlQuerySelect = queries[modulo].select;
            sqlQueryUpdate = queries[modulo].update || "";
        }

        return { sqlQuerySelect, sqlQueryUpdate }; 
    }
}