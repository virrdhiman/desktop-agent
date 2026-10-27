!macro customInstall
  ; Remove shortcuts created by versions before the PIT Agent rebrand.
  Delete "$DESKTOP\VD Agent.lnk"
  Delete "$SMPROGRAMS\VD Agent.lnk"
  Delete "$SMPROGRAMS\VD Agent\VD Agent.lnk"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\VD Agent.lnk"
  Delete "$SMPROGRAMS\VD Agent.lnk"
  Delete "$SMPROGRAMS\VD Agent\VD Agent.lnk"
!macroend
