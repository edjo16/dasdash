 particlesJS("particles-js", {
     particles: {
         number: { value: 60, density: { enable: true, value_area: 800 } },
         color: { value: "#ffffff" },
         shape: {
             type: "circle",
             stroke: { width: 0, color: "#000000" },
             polygon: { nb_sides: 5 },
             image: { src: "img/github.svg", width: 100, height: 100 }
         },
         opacity: {
             value: 0.5,
             random: false,
             anim: { enable: false, speed: 1, opacity_min: 0.1, sync: false }
         },
         size: {
             value: 4,
             random: true,
             anim: { enable: false, speed: 40, size_min: 0.1, sync: false }
         },
         line_linked: {
             enable: true,
             distance: 150,
             color: "#ffffff",
             opacity: 0.4,
             width: 1
         },
         move: {
             enable: true,
             speed: 5,
             direction: "none",
             random: false,
             straight: false,
             out_mode: "out",
             bounce: false,
             attract: { enable: false, rotateX: 600, rotateY: 1200 }
         }
     },
     interactivity: {
         detect_on: "canvas",
         events: {
             onhover: { enable: false, mode: "repulse" },
             onclick: { enable: true, mode: "push" },
             resize: true
         },
         modes: {
             grab: { distance: 400, line_linked: { opacity: 1 } },
             bubble: { distance: 400, size: 40, duration: 2, opacity: 8, speed: 3 },
             repulse: { distance: 200, duration: 0.4 },
             push: { particles_nb: 4 },
             remove: { particles_nb: 2 }
         }
     },
     retina_detect: true
 });
 //Agregar funciones a las pantallas de login
 try {
     document.getElementById("forgot_password").addEventListener("click", function() {
         window.location.href = "/webloginforgot";
     });
 } catch (e) {}
 if (window.location.pathname == "/weblogincambio") {
     //  document.getElementById("login__submit").addEventListener("click", function() {
     //      console.log(document.getElementById("code1").value)
     //      if (document.getElementById("code1").value == document.getElementById("code2").value) {
     //          document.getElementById("login__submit").removeAttribute("disabled")
     //      }
     //  });
     window.onload = (event) => {
         document.getElementById("codeold").focus();
     };

 } else {

     window.onload = (event) => {
         document.getElementById("code").focus();
     };
 }


 function pass2() {
     a = document.getElementById('code1')
     b = document.getElementById('code2')
     if (a.value != b.value) {
         document.getElementById('password-tooltip2').setAttribute('class', 'password-tooltip2 invalido');
     } else if (a.value == b.value) {
         document.getElementById('password-tooltip2').setAttribute('class', 'valido');
         document.getElementById("login__submit").removeAttribute("disabled")
     } else {
         document.getElementById('password-tooltip2').setAttribute('class', 'password-tooltip2');
     }
 };

 function pass1() {
     a = document.getElementById('code1').value
     b = document.getElementById('codeold')
     c = document.getElementById('code2')
     if (a.length > 6) {
         document.getElementById("pass1").setAttribute('style', 'display:none;')
     } else {
         document.getElementById("pass1").setAttribute('style', 'display:auto;')
     }
     var mayus = new RegExp("(?=.*[A-Z])");
     var minus = new RegExp("(?=.*[a-z])");
     if (mayus.test(a) === true && minus.test(a) === true) {
         document.getElementById("pass2").setAttribute('style', 'display:none;')
     } else {
         document.getElementById("pass2").setAttribute('style', 'display:auto;')
     }
     var nums = new RegExp("(?=.*\\d)");
     if (nums.test(a)) {
         document.getElementById("pass3").setAttribute('style', 'display:none;')
     } else {
         document.getElementById("pass3").setAttribute('style', 'display:auto;')
     }
     if (a != b.value) {
         document.getElementById("pass4").setAttribute('style', 'display:none;')
     } else {
         document.getElementById("pass4").setAttribute('style', 'display:auto;')
     }
     if (b.value == '') {
         b.setAttribute('class', 'login__input invalido');
     } else { b.setAttribute('class', 'login__input'); }
     if (c.value != '') {
         if (a != c.value) {
             document.getElementById('code2').setAttribute('class', 'login__input invalido');
         } else if (a == c.value) {
             document.getElementById('code2').setAttribute('class', 'login__input');
             document.getElementById('password-tooltip2').setAttribute('class', 'password-tooltip2');
         }
     }
 };

 function passold() {
     b = document.getElementById('codeold')
     if (b.value == '') {
         b.setAttribute('class', 'login__input invalido');
     } else { b.setAttribute('class', 'login__input'); }

 }


 // var colors = ['#00586F', '#97D1DC', '#C5A266'];
 var colors = ['#00586F', '#97D1DC'];
 var random_color = colors[Math.floor(Math.random() * colors.length)];
 if (random_color == '#00586F') {
     var scolors = ['#E5EEF0', '#B2CCD3', '#669AA8', '#004F63', '#003D4D', '#00232C', "rgba(0,88,111,0.9)", "rgba(0,88,111,0.25)"];
     var lcolor = "invert(20%) sepia(97%) saturate(1233%) hue-rotate(164deg) brightness(96%) contrast(101%)";
 } else if (random_color == '#97D1DC') {
     var scolors = ['#F4FAFB', '#DFF1F4', '#C0E3EA', '#87BCC6', '#69929A', '#3C5358', "rgba(151,209,220,1)", "rgba(151,209,220,0.4)"];
     var lcolor = "invert(85%) sepia(27%) saturate(435%) hue-rotate(148deg) brightness(92%) contrast(87%)";
 } else if (random_color == '#C5A266') {
     var scolors = ['#F9F5EF', '#EDE3D1', '#DCC7A3', '#B1915B', '#897147', '#4E4028', "rgba(197,162,102,0.9)", "rgba(197,162,102,0.4)"];
     var lcolor = "invert(68%) sepia(40%) saturate(413%) hue-rotate(359deg) brightness(91%) contrast(87%)";
 }
 document.getElementById('bodyconainer').setAttribute("style", "background:linear-gradient(45deg, " + scolors[7] + "," + scolors[6] + ");z-index: 1000;");
 document.getElementsByClassName("screen")[0].setAttribute("style", "background: linear-gradient(90deg," + scolors[4] + ", " + scolors[2] + ");  box-shadow: 0px 0px 24px " + scolors[3] + ";");
 document.getElementsByClassName("screen__background__shape2")[0].setAttribute("style", "background:" + scolors[5] + ";");
 document.getElementsByClassName("screen__background__shape3")[0].setAttribute("style", " background: linear-gradient(270deg," + scolors[5] + "," + scolors[1] + ");");
 document.getElementsByClassName("screen__background__shape4")[0].setAttribute("style", " background:" + scolors[1] + ";");
 // document.getElementsByClassName("login__icon")[0].setAttribute("style", " color:" + scolors[1] + ";");
 // document.getElementsByClassName("login__icon")[1].setAttribute("style", " color:" + scolors[1] + ";");
 // document.getElementsByClassName("login__icon")[2].setAttribute("style", " color:" + scolors[1] + ";");

 a = document.getElementsByClassName("login__icon");
 for (var i = 0; i < a.length; i++) {
     a[i].setAttribute("style", " color:" + scolors[1] + ";");
 }
 document.getElementById("logo").style.filter = lcolor;
 document.getElementsByClassName("password-tooltip")[0].setAttribute('style', 'background-color:' + scolors[0] + ";");
 document.getElementsByClassName("password-tooltip2")[0].setAttribute('style', 'background-color:' + scolors[0] + ";");