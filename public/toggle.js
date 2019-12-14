// public/toggle.js
// allows elements to be toggled on and off
/*
Element.prototype.toggle = function() {
    if ( this.style.display == '' || this.style.display == 'block' ) {
        this.style.display = 'none';
    }else{
        this.style.display = 'block';
   }
}
*/

function toggle(el) {
    if ( el.style.display == '' || el.style.display == 'block' ) {
        el.style.display = 'none';
    }else{
        el.style.display = '';
   }
}
