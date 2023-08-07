/* eslint-env jest */
import { coordinatesFromMapsUrl } from './maps';
import * as geocode from './geocode';

jest.mock('./geocode', () => ({
  forwardLookup: jest.fn()
}));

describe('url parsing', () => {
  it('should parse coordinates apple maps url', async () => {
    let coords = await coordinatesFromMapsUrl('https://maps.apple.com/?ll=37.3319,-122.0312');
    expect(coords).toEqual([37.3319, -122.0312]);
  });

  it('should parse coordinates google.com/maps', async () => {
    let coords1 = await coordinatesFromMapsUrl('https://www.google.com/maps/@37.3319,-122.0312,17z');
    expect(coords1).toEqual([37.3319, -122.0312]);

    let coords2 = await coordinatesFromMapsUrl('https://www.google.com/maps/place/Some+place+somewhere/@37.3319,-122.0312,17z');
    expect(coords2).toEqual([37.3319, -122.0312]);
  });

  it('should reverse lookup coordinates based of query of maps.google.com?q=', async () => {
    geocode.forwardLookup.mockResolvedValue([{position: {lat: 37.3319, lng: -122.0312}}]);

    let coords = await coordinatesFromMapsUrl('https://www.google.com/maps?q=Some+place+somewhere');
    expect(coords).toEqual([37.3319, -122.0312]);
  });
});
