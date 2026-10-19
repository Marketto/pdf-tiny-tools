/* Compila, română: parole che dicono il tipo di un campo (R-CPL-06). Espressioni sull'etichetta in minuscolo. */
(window.CPL_LANG=window.CPL_LANG||{}).ro={
  date:"\\bdata\\b|(^|\\s)dat[ăa]($|\\s)|\\bdatei\\b|\\bla data\\b|^din$|^p[âa]n[ăa] la$|valabil|eliberat|expir|\\bziua\\b",
  money:"\\blei\\b|\\bron\\b|\\bsum[aăe]|€|\\bpre[țţt]|total|plat[aă]|\\btax[aă]|euro|valoare",
  number:"telefon|\\btel\\b|mobil|\\bfax\\b|\\bnr\\b|(?<!cod\\s)num[ăa]r|\\bv[âa]rst|cantitat|\\bbuc\\b",
  postcode:"cod po[șşs]tal",
  year:"\\banul\\b|^an$",
  tax:"\\bcnp\\b|cod numeric personal|\\bcif\\b|\\bcui\\b|cod fiscal|identificare fiscal",
  sign:"semn[ăa]tur",
  place:"n[ăa]scut|locul na[șşs]terii|domicili|re[șşs]edin|adres|localitat|ora[șşs]|comun|jude[țţ]|(^|\\s)[îi]n$",
  on:"la",at:"în",
  nice:{"tel.":"Telefon","tel":"Telefon","nr.":"Număr","nr":"Număr","str.":"Strada","jud.":"Județ","cnp":"CNP","e-mail":"E-mail","email":"E-mail","bl.":"Bloc","ap.":"Apartament","sc.":"Scara"},
  short:["Tel.","Nr.","Str.","Bl.","Sc.","Ap.","Jud.","CNP","Data","Nume","Prenume","Semnătura","la","în","din"],
  birthDate:"Data nașterii",birthPlace:"Locul nașterii",date0:"data",inWords:"(în litere)",prov:"Județ"
};
