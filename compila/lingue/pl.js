/* Compila, polski: parole che dicono il tipo di un campo (R-CPL-06). Espressioni sull'etichetta in minuscolo. */
(window.CPL_LANG=window.CPL_LANG||{}).pl={
  date:"\\bdata\\b|urodzon[ya] dnia|\\bdnia\\b|^od$|^do$|wa[żz]n|wydan|(^|\\s)dzie[ńn]($|\\s)|termin",
  money:"z[łl]ot|(^|\\s)z[łl]($|\\s|\\.)|\\bpln\\b|kwota|€|\\bsuma\\b|\\bcena\\b|razem|wp[łl]at|op[łl]at|nale[żz]no|euro",
  number:"telefon|\\btel\\b|kom[óo]rk|\\bfax\\b|\\bnr\\b(?!\\.?\\s*(pesel|nip|regon))|numer(?!\\s+(pesel|nip|regon|identyfikacji))|\\bwiek\\b|ilo[śs][ćc]|liczba|\\bszt\\b",
  postcode:"kod pocztowy|^kod$",
  year:"\\brok\\b|rocznik",
  tax:"\\bpesel\\b|\\bnip\\b|\\bregon\\b|identyfikacji podatkowej",
  sign:"podpis",
  place:"urodzon|miejsce urodzenia|zamieszka[łl]|adres|miejscowo[śs][ćc]|\\bmiasto\\b|gmina|\\bw$",
  on:"dnia",at:"w",
  nice:{"tel.":"Telefon","tel":"Telefon","nr":"Numer","nr.":"Numer","kod":"Kod pocztowy","ur.":"Data urodzenia","e-mail":"E-mail","email":"E-mail","tel. kom.":"Telefon komórkowy","ul.":"Ulica"},
  short:["Tel.","Nr","Ul.","Kod","PESEL","NIP","Imię","Nazwisko","Data","Podpis","Ur.","dnia","w","od","do"],
  birthDate:"Data urodzenia",birthPlace:"Miejsce urodzenia",date0:"data",inWords:"(słownie)",prov:"Województwo"
};
