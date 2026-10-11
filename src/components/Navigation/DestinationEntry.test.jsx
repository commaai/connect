import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DestinationEntry from './DestinationEntry';
import { athena } from '../../api';

vi.mock('../../api', () => ({ athena: { postJsonRpcPayload: vi.fn() } }));
const device = { prime: true, last_athena_ping: 1000, fetched_at: 1000 };
const place = { id: 'place.1', place_name: 'Balboa Park, San Diego', center: [-117.15, 32.73] };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ features: [place] }) })));
  athena.postJsonRpcPayload.mockResolvedValue({ result: { success: 1 } });
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function selectDestination() {
  fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'Balboa Park' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: place.place_name }));
}

it('requires confirmation and sends coordinates to the selected device', async () => {
  render(<DestinationEntry device={device} dongleId="test-device" />);
  await selectDestination();
  expect(athena.postJsonRpcPayload).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Send destination' }));
  await screen.findByText('Destination sent to your device.');
  expect(athena.postJsonRpcPayload).toHaveBeenCalledWith('test-device', {
    jsonrpc: '2.0', id: 0, method: 'setNavDestination', params: { longitude: -117.15, latitude: 32.73 },
  });
});

it.each([{ ...device, prime: false }, { ...device, last_athena_ping: 0 }])('disables sending without Prime or connectivity', async unavailable => {
  render(<DestinationEntry device={unavailable} dongleId="test-device" />);
  await selectDestination();
  expect(screen.getByRole('button', { name: 'Send destination' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Clear destination' })).toBeDisabled();
});

it('clears the destination through Athena', async () => {
  render(<DestinationEntry device={device} dongleId="test-device" />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear destination' }));
  await screen.findByText('Destination cleared.');
  expect(athena.postJsonRpcPayload).toHaveBeenCalledWith('test-device', { jsonrpc: '2.0', id: 0, method: 'clearNavDestination', params: {} });
});

it('shows an RPC failure rather than reporting success', async () => {
  athena.postJsonRpcPayload.mockResolvedValue({ error: { code: -32601 } });
  render(<DestinationEntry device={device} dongleId="test-device" />);
  await selectDestination();
  fireEvent.click(screen.getByRole('button', { name: 'Send destination' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Destination sent to your device.')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send destination' })).not.toBeDisabled());
});
