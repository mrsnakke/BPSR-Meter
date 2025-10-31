; Eliminar carpeta de datos de usuario en Roaming al desinstalar
Section "Remove AppData" SECREMOVEAPPDATA
    RMDir /r "$APPDATA\bpsr-meter"
SectionEnd

; Sección para instalar Visual C++ Redistributable
Section "Install VCRedist"
    ; Comprobar si el redistribuible ya está instalado (opcional, para simplificar lo instalamos siempre)
    ; Si se desea una comprobación más robusta, se puede buscar en el registro.

    ; Ejecutar el instalador de Visual C++ Redistributable de forma silenciosa
    ; El archivo vc_redist.x64.exe se copia a $INSTDIR por extraResources
    ExecWait '"$INSTDIR\vc_redist.x64.exe" /install /quiet /norestart'

    ; Eliminar el instalador después de la instalación (opcional)
    Delete "$INSTDIR\vc_redist.x64.exe"
SectionEnd
