// const { pick } = require("lodash");
$(document).ready(function() {
    $.ajax({
            url: '/approval-summary',
            type: 'GET',
            success: function(response) {
                log = response.result.recordset
                var average = []
                var temp = []
                var departamentos = []
                var total = []
                var time_dep = []
                for (var item in log) {
                    if (!(departamentos.includes(log[item].departamento))) {
                        departamentos.push(log[item].departamento)
                    }

                }
                for (var item in time_dep) {
                    average[item] = Number(time_dep[item]) / total[item]
                }

            }
        })
 });