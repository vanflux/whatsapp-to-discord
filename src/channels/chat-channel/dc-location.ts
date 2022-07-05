import { Message as WaMessage } from "@open-wa/wa-automate";
import { ButtonInteraction, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed } from "discord.js";
import StaticMaps from "staticmaps";

interface LocationInputData {
  lat: number;
  lng: number;
  zoom?: number;
}

interface LocationOutputData {
  embeds: MessageEmbed[],
  files: MessageAttachment[],
  components: MessageActionRow[];
}

export default class DcLocation {
  async build(input: LocationInputData): Promise<LocationOutputData> {
    const mapFileName = 'map.png';
    const options = { width: 450, height: 300 };
    const map = new StaticMaps(options);
    const center = [input.lng, input.lat];
    map.addMarker({
      width: 48,
      height: 48,
      coord: [input.lng, input.lat],
      img: 'assets/images/marker.png',
    })

    await map.render(center, input.zoom);
    const mapImageBuf = await map.image.buffer('png');
    const attachment = new MessageAttachment(mapImageBuf, mapFileName);

    const embed = new MessageEmbed();
    embed.addField('Lat', `${input.lat}`, true);
    embed.addField('Lng', `${input.lng}`, true);
    embed.addField('Zoom', `${input.zoom}`, true);
    embed.addField('Maps', `https://www.google.com.br/maps/dir//${input.lat},${input.lng}/@${input.lat},${input.lng},${input.zoom}z`, false);
    embed.setImage(`attachment://${mapFileName}`);
    
    const btnZoomOut = new MessageButton({ customId: 'location_zoom_out', style: 'PRIMARY', label: 'Zoom Out' });
    const btnZoomIn = new MessageButton({ customId: 'location_zoom_in', style: 'PRIMARY', label: 'Zoom In' });
    const component = new MessageActionRow({ components: [btnZoomOut, btnZoomIn] });

    return { embeds: [embed], files: [attachment], components: [component] };
  }

  extractInputData(waMessage: WaMessage, buttonInteraction: ButtonInteraction) {
    const lat = parseFloat(waMessage.lat || '0');
    const lng = parseFloat(waMessage.lng || '0');
    const zoom = parseInt(buttonInteraction.message.embeds[0]?.fields?.find(field => field.name === 'Zoom')?.value || '17');
    return {lat, lng, zoom};
  }

}
