export default class EquipmentCheckOutRule {
    static async validateTeam(iddevteam) {
        return ['lossa', 'rparra', 'dgutierrez'].includes(iddevteam)
    }

 

}