let visible = false;

function setVisible(next: boolean): void {
    visible = next;
    SetNuiFocus(visible, visible);
    SendNUIMessage({ type: 'visibility', visible });

    if (visible) {
        emitNet('pg-wrapper:requestStats');
    }
}

onNet('pg-wrapper:openStats', () => {
    setVisible(!visible);
});

onNet('pg-wrapper:stats', (payload: unknown) => {
    SendNUIMessage({ type: 'stats', payload });
});

onNet('pg-wrapper:disabled', (reason: string) => {
    SendNUIMessage({ type: 'disabled', reason });
});

RegisterNuiCallbackType('close');
on('__cfx_nui:close', (_data: unknown, cb: (result: unknown) => void) => {
    setVisible(false);
    cb({ ok: true });
});

RegisterNuiCallbackType('refresh');
on('__cfx_nui:refresh', (_data: unknown, cb: (result: unknown) => void) => {
    emitNet('pg-wrapper:requestStats');
    cb({ ok: true });
});
