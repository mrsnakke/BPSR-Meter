; Eliminar carpeta de datos de usuario en Roaming al desinstalar
Section "Remove AppData" SECREMOVEAPPDATA
    RMDir /r "$APPDATA\bpsr-meter"
SectionEnd
