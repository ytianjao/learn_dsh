      const uiState={dialogOpen:false,selectedView:'plan',sessionId:null,listeners:new Set()}
      function notifyUi(){uiState.listeners.forEach(function(listener){listener()})}
      function rememberLearnLoopSession(sessionId){if(sessionId&&uiState.sessionId!==sessionId){uiState.sessionId=sessionId;notifyUi()}}
      function openLearnLoopView(view,sessionId){uiState.dialogOpen=true;uiState.selectedView=view;if(sessionId)uiState.sessionId=sessionId;notifyUi()}
      function closeLearnLoopView(){uiState.dialogOpen=false;notifyUi()}
      function subscribeLearnLoopUi(listener){uiState.listeners.add(listener);return function(){uiState.listeners.delete(listener)}}
      function effect(kind,detail){return Object.assign({kind:kind},detail||{})}
