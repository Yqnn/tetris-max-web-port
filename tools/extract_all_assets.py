#!/usr/bin/env python3
"""
Extract all Tetris Max assets (backgrounds, pieces, music) from resource forks
"""

import struct
import os
import subprocess
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_PATH = os.path.join(SCRIPT_DIR, "..", "Tetris Max PPC Project", "Tetris Max Data")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public")

PNG_COMPRESS_LEVEL = 9  # Match ref (max compression, smaller files)


def save_png(img, path):
    """Save image as PNG, using palette mode when possible for smaller files."""
    save_kw = {"compress_level": PNG_COMPRESS_LEVEL}
    if img.mode != "RGB":
        img.save(path, **save_kw)
        return
    colors_used = set(img.getdata())
    if len(colors_used) <= 256:
        # Build exact palette (deterministic order). Pillow requires 768 bytes (256*3).
        palette = []
        color_to_idx = {}
        for c in sorted(colors_used):
            color_to_idx[c] = len(palette)
            palette.extend(c)
        # Pad to 256 entries (768 bytes) - Pillow's putpalette() requires full length
        while len(palette) < 768:
            palette.append(0)
        pal_img = Image.new("P", img.size)
        pal_img.putpalette(palette)
        px = img.load()
        for y in range(img.size[1]):
            for x in range(img.size[0]):
                pal_img.putpixel((x, y), color_to_idx[px[x, y]])
        pal_img.save(path, **save_kw)
    else:
        img.save(path, **save_kw)



def read_resource_fork(filepath):
    rsrc_path = filepath + '/..namedfork/rsrc'
    if os.path.exists(rsrc_path):
        with open(rsrc_path, 'rb') as f:
            return f.read()
    return None

def parse_resource_map(data, return_names=False):
    """Parse Mac resource map. If return_names=True, returns (resources, names) where
    names is a dict (res_type, res_id) -> str (resource name from the fork, or '' if unnamed).
    """
    if len(data) < 16:
        return ({} if return_names else {}, {}) if return_names else {}
    data_offset = struct.unpack('>I', data[0:4])[0]
    map_offset = struct.unpack('>I', data[4:8])[0]
    type_list_offset = map_offset + struct.unpack('>H', data[map_offset + 24:map_offset + 26])[0]
    name_list_offset = map_offset + struct.unpack('>H', data[map_offset + 26:map_offset + 28])[0]
    resources = {}
    names = {}
    num_types = struct.unpack('>H', data[type_list_offset:type_list_offset + 2])[0] + 1
    pos = type_list_offset + 2
    for i in range(num_types):
        res_type = data[pos:pos + 4].decode('mac_roman', errors='replace')
        num_resources = struct.unpack('>H', data[pos + 4:pos + 6])[0] + 1
        ref_list_offset = struct.unpack('>H', data[pos + 6:pos + 8])[0]
        ref_pos = type_list_offset + ref_list_offset
        for j in range(num_resources):
            res_id = struct.unpack('>h', data[ref_pos:ref_pos + 2])[0]
            name_offset_rel = struct.unpack('>H', data[ref_pos + 2:ref_pos + 4])[0]
            attrs_and_offset = struct.unpack('>I', data[ref_pos + 4:ref_pos + 8])[0]
            res_data_offset = attrs_and_offset & 0x00FFFFFF
            actual_offset = data_offset + res_data_offset
            res_length = struct.unpack('>I', data[actual_offset:actual_offset + 4])[0]
            res_data = data[actual_offset + 4:actual_offset + 4 + res_length]
            if res_type not in resources:
                resources[res_type] = {}
            resources[res_type][res_id] = res_data
            if return_names:
                if name_offset_rel != 0xFFFF:
                    name_pos = name_list_offset + name_offset_rel
                    if name_pos < len(data):
                        name_len = data[name_pos]
                        if name_pos + 1 + name_len <= len(data):
                            names[(res_type, res_id)] = data[name_pos + 1:name_pos + 1 + name_len].decode('mac_roman', errors='replace')
                        else:
                            names[(res_type, res_id)] = ''
                    else:
                        names[(res_type, res_id)] = ''
                else:
                    names[(res_type, res_id)] = ''
            ref_pos += 12
        pos += 8
    if return_names:
        return resources, names
    return resources

def extract_ppat(ppat_data):
    """Extract pixel pattern (ppat) resource to an image.
    Supports type 0 (indexed, PixMap inlined) and type 1 (full-color, PixMap/pixel data via handles).
    """
    if len(ppat_data) < 50:
        return None

    pat_type = struct.unpack('>h', ppat_data[0:2])[0]

    if pat_type == 0:
        # Type 0: PixMap inlined at offset 2, pixel data at fixed offset ~74
        pm_offset = 2
        row_bytes_raw = struct.unpack('>H', ppat_data[pm_offset + 4:pm_offset + 6])[0]
        row_bytes = row_bytes_raw & 0x3FFF
        top = struct.unpack('>h', ppat_data[pm_offset + 6:pm_offset + 8])[0]
        left = struct.unpack('>h', ppat_data[pm_offset + 8:pm_offset + 10])[0]
        bottom = struct.unpack('>h', ppat_data[pm_offset + 10:pm_offset + 12])[0]
        right = struct.unpack('>h', ppat_data[pm_offset + 12:pm_offset + 14])[0]
        width = right - left
        height = bottom - top
        pixel_size = struct.unpack('>h', ppat_data[pm_offset + 32:pm_offset + 34])[0]
        pixel_data_start = 74
        # Color table: search after structure
        ct_offset = None
        for i in range(74, len(ppat_data) - 8):
            potential_size = struct.unpack('>h', ppat_data[i + 6:i + 8])[0]
            if 0 <= potential_size <= 255:
                ct_offset = i
                break
        if ct_offset is None:
            return None
    elif pat_type == 1:
        # Type 1: patMap and patData are handles (offsets into this resource)
        pm_offset = struct.unpack('>I', ppat_data[2:6])[0]
        pixel_data_start = struct.unpack('>I', ppat_data[6:10])[0]
        if pm_offset + 50 > len(ppat_data) or pixel_data_start >= len(ppat_data):
            return None
        row_bytes_raw = struct.unpack('>H', ppat_data[pm_offset + 4:pm_offset + 6])[0]
        row_bytes = row_bytes_raw & 0x3FFF
        top = struct.unpack('>h', ppat_data[pm_offset + 6:pm_offset + 8])[0]
        left = struct.unpack('>h', ppat_data[pm_offset + 8:pm_offset + 10])[0]
        bottom = struct.unpack('>h', ppat_data[pm_offset + 10:pm_offset + 12])[0]
        right = struct.unpack('>h', ppat_data[pm_offset + 12:pm_offset + 14])[0]
        width = right - left
        height = bottom - top
        pixel_size = struct.unpack('>h', ppat_data[pm_offset + 32:pm_offset + 34])[0]
        # Color table immediately after pixel data (for indexed type 1)
        ct_offset = pixel_data_start + height * row_bytes
        if ct_offset + 8 > len(ppat_data):
            return None
        potential_size = struct.unpack('>h', ppat_data[ct_offset + 6:ct_offset + 8])[0]
        if not (0 <= potential_size <= 255):
            return None
    else:
        print(f"  Unsupported ppat type: {pat_type}")
        return None

    # Parse color table (same for type 0 and type 1 indexed)
    ct_size = struct.unpack('>h', ppat_data[ct_offset + 6:ct_offset + 8])[0] + 1
    colors = []
    ct_entry_start = ct_offset + 8
    for i in range(ct_size):
        entry_offset = ct_entry_start + i * 8
        if entry_offset + 8 > len(ppat_data):
            break
        r = struct.unpack('>H', ppat_data[entry_offset + 2:entry_offset + 4])[0] >> 8
        g = struct.unpack('>H', ppat_data[entry_offset + 4:entry_offset + 6])[0] >> 8
        b = struct.unpack('>H', ppat_data[entry_offset + 6:entry_offset + 8])[0] >> 8
        colors.append((r, g, b))

    if not colors:
        return None

    # Build palette image (P mode) to match ref: palette 0..ct_size-1 = ppat colors,
    # index 255 = black; resource pixel value 0 is written as 255 (ref convention).
    palette = []
    for c in colors:
        palette.extend(c)
    while len(palette) < 768:
        palette.append(0)
    palette[255 * 3 : 255 * 3 + 3] = [0, 0, 0]  # index 255 = black
    img = Image.new("P", (width, height))
    img.putpalette(palette)

    def map_index(color_idx):
        # Ref convention: black (0,0,0) is stored at palette index 255; others at 0..N-1
        if color_idx < len(colors):
            if colors[color_idx] == (0, 0, 0):
                return 255
            return color_idx
        return 255

    if pixel_size == 8:
        for y in range(height):
            for x in range(width):
                byte_offset = pixel_data_start + y * row_bytes + x
                if byte_offset < len(ppat_data):
                    color_idx = ppat_data[byte_offset]
                    img.putpixel((x, y), map_index(color_idx))
    elif pixel_size == 4:
        # 4 bpp: 2 pixels per byte, high nibble first
        for y in range(height):
            row_start = pixel_data_start + y * row_bytes
            for x in range(width):
                byte_idx = row_start + (x // 2)
                if byte_idx >= len(ppat_data):
                    break
                byte_val = ppat_data[byte_idx]
                color_idx = (byte_val >> (4 if (x & 1) == 0 else 0)) & 0x0F
                img.putpixel((x, y), map_index(color_idx))
    else:
        return None

    return img

def unpack_bits(packed_data, row_bytes, height):
    """Unpack PackBits compressed data"""
    unpacked = bytearray()
    pos = 0
    
    for row in range(height):
        if row_bytes > 250:
            if pos + 2 > len(packed_data):
                break
            packed_row_size = struct.unpack('>H', packed_data[pos:pos+2])[0]
            pos += 2
        else:
            if pos >= len(packed_data):
                break
            packed_row_size = packed_data[pos]
            pos += 1
        
        row_end = pos + packed_row_size
        row_data = bytearray()
        
        while pos < row_end and len(row_data) < row_bytes:
            if pos >= len(packed_data):
                break
            flag = packed_data[pos]
            pos += 1
            
            if flag > 127:
                count = 257 - flag
                if pos < len(packed_data):
                    val = packed_data[pos]
                    pos += 1
                    row_data.extend([val] * count)
            else:
                count = flag + 1
                if pos + count <= len(packed_data):
                    row_data.extend(packed_data[pos:pos + count])
                    pos += count
        
        row_data.extend([0] * (row_bytes - len(row_data)))
        unpacked.extend(row_data[:row_bytes])
    
    return bytes(unpacked)

def decode_pict(pict_data):
    """Decode a PICT resource to an image. Returns P-mode image matching ref (palette order, black at 255)."""
    if len(pict_data) < 10:
        return None

    # Get frame
    frame_top = struct.unpack('>h', pict_data[2:4])[0]
    frame_left = struct.unpack('>h', pict_data[4:6])[0]
    frame_bottom = struct.unpack('>h', pict_data[6:8])[0]
    frame_right = struct.unpack('>h', pict_data[8:10])[0]
    width = frame_right - frame_left
    height = frame_bottom - frame_top

    if width <= 0 or height <= 0 or width > 2000 or height > 2000:
        return None

    pos = 10
    colors = []
    pixel_data = None
    row_bytes = pm_width = pm_height = 0

    while pos < len(pict_data) - 1:
        opcode = struct.unpack('>H', pict_data[pos:pos+2])[0]
        pos += 2
        # Skip NOP (0x0000) only; do not skip single zero bytes (part of 0x0011 etc.)
        if opcode == 0x0000:
            continue

        if opcode == 0x00FF:
            break
        elif opcode == 0x0011:
            pos += 2
        elif opcode == 0x02FF:
            # PICT version opcode (v2); skip 2-byte version
            pos += 2
        elif opcode == 0x0C00:
            pos += 24
        elif opcode == 0x001E:
            pass
        elif opcode == 0x0001:
            if pos + 2 <= len(pict_data):
                rgn_size = struct.unpack('>H', pict_data[pos:pos+2])[0]
                pos += rgn_size
        elif opcode in [0x0098, 0x0099, 0x009A, 0x009B]:
            has_region = opcode in [0x0099, 0x009B]
            row_bytes_raw = struct.unpack('>H', pict_data[pos:pos+2])[0]
            row_bytes = row_bytes_raw & 0x3FFF
            pos += 2
            bounds_top = struct.unpack('>h', pict_data[pos:pos+2])[0]
            bounds_left = struct.unpack('>h', pict_data[pos+2:pos+4])[0]
            bounds_bottom = struct.unpack('>h', pict_data[pos+4:pos+6])[0]
            bounds_right = struct.unpack('>h', pict_data[pos+6:pos+8])[0]
            pos += 8
            pm_width = bounds_right - bounds_left
            pm_height = bounds_bottom - bounds_top
            # PixMap layout varies (PackBitsRect vs PackBitsRgn); find color table by ct_size
            bounds_end = pos
            ct_start = None
            best_size = 0
            for skip in range(0, min(60, len(pict_data) - bounds_end - 8)):
                candidate = bounds_end + skip
                if candidate + 8 > len(pict_data):
                    break
                ct_size_val = struct.unpack('>h', pict_data[candidate + 6:candidate + 8])[0] + 1
                if 1 <= ct_size_val <= 256 and ct_size_val > best_size:
                    best_size = ct_size_val
                    ct_start = candidate
            if ct_start is None:
                break
            ct_size = struct.unpack('>h', pict_data[ct_start + 6:ct_start + 8])[0] + 1
            pos = ct_start + 8
            colors = []
            for i in range(ct_size):
                if pos + 8 > len(pict_data):
                    break
                r = struct.unpack('>H', pict_data[pos + 2:pos + 4])[0] >> 8
                g = struct.unpack('>H', pict_data[pos + 4:pos + 6])[0] >> 8
                b = struct.unpack('>H', pict_data[pos + 6:pos + 8])[0] >> 8
                colors.append((r, g, b))
                pos += 8
            # After color table: srcRect (8) + dstRect (8), then mask region (2 + rgn_size), then 10-byte pad. Then packed pixel data.
            pos += 16  # srcRect + dstRect
            if pos + 2 > len(pict_data):
                break
            rgn_size = struct.unpack('>H', pict_data[pos:pos + 2])[0]
            pos += 2 + rgn_size + 10  # region + pad to packed data
            if pos >= len(pict_data):
                break
            packed_data = pict_data[pos:]
            try:
                pixel_data = unpack_bits(packed_data, row_bytes, pm_height)
            except (IndexError, struct.error):
                break
            if len(pixel_data) != row_bytes * pm_height:
                break
            break
        else:
            break

    if not colors or pixel_data is None:
        return None

    # Build P-mode image to match ref: PICT palette order, black at index 255
    palette = []
    for c in colors:
        palette.extend(c)
    while len(palette) < 768:
        palette.append(0)
    palette[255 * 3 : 255 * 3 + 3] = [0, 0, 0]
    img = Image.new("P", (width, height))
    img.putpalette(palette)

    def map_index(color_idx):
        if color_idx < len(colors):
            if colors[color_idx] == (0, 0, 0):
                return 255
            return color_idx
        return 255

    for y in range(min(pm_height, height)):
        for x in range(min(pm_width, width)):
            byte_offset = y * row_bytes + x
            if byte_offset < len(pixel_data):
                color_idx = pixel_data[byte_offset]
                img.putpixel((x, y), map_index(color_idx))
    return img

def extract_backgrounds(name, filepath, output_dir):
    """Extract ppat background patterns"""
    print(f"\nExtracting backgrounds: {name}")
    
    data = read_resource_fork(filepath)
    if not data:
        print(f"  Could not read resource fork")
        return False
    
    resources = parse_resource_map(data)
    ppat_resources = resources.get('ppat') or resources.get('PPAT')
    if not ppat_resources:
        print(f"  No ppat resources found")
        return False

    os.makedirs(output_dir, exist_ok=True)

    for res_id in sorted(ppat_resources.keys()):
        ppat_data = ppat_resources[res_id]
        level = res_id - 127  # ppat 128 = level 1, etc.
        img = extract_ppat(ppat_data)
        if img:
            # Zero-padded filename (level01.png ... level10.png) for smaller, consistent naming
            output_name = f"level{level:02d}.png"
            output_file = os.path.join(output_dir, output_name)
            save_png(img, output_file)
            print(f"  Saved: {output_name} ({img.size[0]}x{img.size[1]})")
        else:
            print(f"  Failed to extract ppat {res_id}")
    
    return True

def extract_pieces(name, filepath, output_dir, output_name):
    """Extract PICT pieces"""
    print(f"\nExtracting pieces: {name}")
    
    data = read_resource_fork(filepath)
    if not data:
        print(f"  Could not read resource fork")
        return False
    
    resources = parse_resource_map(data)
    pict_resources = resources.get('PICT') or resources.get('pict')
    if not pict_resources:
        print(f"  No PICT resources found")
        return False

    os.makedirs(output_dir, exist_ok=True)

    # PICT 128 is the standard size pieces
    if 128 in pict_resources:
        pict_data = pict_resources[128]
        img = decode_pict(pict_data)
        if img:
            output_file = os.path.join(output_dir, output_name)
            save_png(img, output_file)
            print(f"  Saved: {output_name} ({img.size[0]}x{img.size[1]})")
        else:
            print(f"  Failed to decode PICT 128")
    return True

def _safe_segment_filename(name):
    """Sanitize segment name for use in a filename."""
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name).strip("_") or "segment"


def extract_music(name, filepath, output_dir, file_prefix):
    """Extract music using ffmpeg for MACE decompression.
    file_prefix is used for output filenames: {file_prefix}_{segment_name}.wav
    Segment names are read from each snd resource's name in the resource fork;
    if a resource has no name, fallback is STR# 128 order or segment_{res_id}.
    """
    print(f"\nExtracting music: {name}")
    
    data = read_resource_fork(filepath)
    if not data:
        print(f"  Could not read resource fork")
        return False
    
    resources, resource_names = parse_resource_map(data, return_names=True)
    
    # Fallback: STR# 128 unique names (in case some snd resources are unnamed)
    fallback_names = []
    if 'STR#' in resources and 128 in resources['STR#']:
        str_data = resources['STR#'][128]
        count = struct.unpack('>H', str_data[0:2])[0]
        pos = 2
        for i in range(count):
            if pos >= len(str_data):
                break
            length = str_data[pos]
            pos += 1
            name_str = str_data[pos:pos + length].decode('mac_roman', errors='replace')
            fallback_names.append(name_str)
            pos += length
        fallback_names = list(dict.fromkeys(fallback_names))
        print(f"  Found {len(fallback_names)} segment names in STR# 128 (fallback): {fallback_names}")
    
    if 'snd ' not in resources:
        print(f"  No snd resources found")
        return False
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Process snd resources in deterministic order (sorted by res_id)
    # Use each resource's name from the fork; fallback to STR# order or segment_{res_id}
    snd_items = sorted(resources['snd '].items())
    for idx, (res_id, snd_data) in enumerate(snd_items):
        segment_name = resource_names.get(('snd ', res_id), '').strip()
        if not segment_name and idx < len(fallback_names):
            segment_name = fallback_names[idx]
        if not segment_name:
            segment_name = f"segment_{res_id}"
        base_name = f"{file_prefix}_{_safe_segment_filename(segment_name)}.wav"
        print(f"  Processing snd {res_id} ({len(snd_data)} bytes) -> {base_name}")
        
        # Parse snd format and find sound header via bufferCmd/soundCmd
        if len(snd_data) < 10:
            continue
        
        format_type = struct.unpack('>H', snd_data[0:2])[0]
        header_offset = None
        
        if format_type == 1:
            # Format 1: skip data format entries, then read commands; param2 = header offset
            num_synths = struct.unpack('>H', snd_data[2:4])[0]
            pos = 4 + num_synths * 6
            num_cmds = struct.unpack('>H', snd_data[pos:pos+2])[0]
            pos += 2
            for _ in range(num_cmds):
                cmd = struct.unpack('>H', snd_data[pos:pos+2])[0]
                param2 = struct.unpack('>I', snd_data[pos+4:pos+8])[0]
                pos += 8
                # bufferCmd (0x8051) or soundCmd (0x8050)
                if cmd in (0x8051, 0x8050):
                    header_offset = param2
                    break
        elif format_type == 2:
            # Format 2: header follows immediately after reference count
            header_offset = 4
        else:
            continue
        
        if header_offset is None or header_offset + 22 > len(snd_data):
            continue
        
        # Sound header at header_offset
        num_samples = struct.unpack('>I', snd_data[header_offset+4:header_offset+8])[0]
        sample_rate_raw = struct.unpack('>I', snd_data[header_offset+8:header_offset+12])[0]
        sample_rate = sample_rate_raw >> 16
        encode = snd_data[header_offset+20]
        
        if encode == 0xFE:
            # Compressed (extended) header: data starts at +78 and runs to end of resource
            comp_id = struct.unpack('>h', snd_data[header_offset+56:header_offset+58])[0]
            data_start = header_offset + 78  # 22 + 4 + 10 + 4 + 22 + 2 + 14
            if comp_id == 3:
                # MACE 3:1: use all bytes from data_start to end (header num_frames is often too small)
                compressed_data = snd_data[data_start:]
                num_frames = len(compressed_data) * 3
                temp_aifc = os.path.join(output_dir, f'temp_{res_id}.aifc')
                output_file = os.path.join(output_dir, base_name)
                aifc_data = build_aifc_mace(compressed_data, sample_rate, num_frames)
                with open(temp_aifc, 'wb') as f:
                    f.write(aifc_data)
                result = subprocess.run(
                    ['ffmpeg', '-y', '-i', temp_aifc, '-acodec', 'pcm_s16le', output_file],
                    capture_output=True
                )
                if result.returncode == 0:
                    print(f"  Saved: {base_name} (MACE decoded)")
                    os.remove(temp_aifc)
                else:
                    print(f"  Failed to decode MACE for {res_id}")
            else:
                print(f"  Unsupported compression id {comp_id} for snd {res_id}")
        else:
            print(f"  Unsupported encode {encode} for snd {res_id}")
    
    return True

def build_aifc_mace(compressed_data, sample_rate, num_samples):
    """Build an AIFF-C file with MACE 3:1 compression (ffmpeg-compatible)."""
    import struct
    
    # FORM chunk
    form_type = b'AIFC'
    
    # COMM chunk for AIFF-C
    num_channels = 1
    num_sample_frames = num_samples
    sample_size = 8
    
    # 80-bit extended sample rate: ffmpeg uses exp = stored - 16383 - 63, rate = (val + round) >> -exp
    def to_extended(rate):
        if rate == 0:
            return b'\x00' * 10
        # Encode so (val + (1<<(-exp-1))) >> -exp == rate; use val = rate << (-exp), exp negative
        shift = 14
        while (rate << shift) >= (1 << 63):
            shift -= 1
        val = rate << shift
        stored_exp = 16383 + 63 - shift
        return struct.pack('>HQ', stored_exp, val)
    
    sample_rate_ext = to_extended(sample_rate)
    compression_type = b'MAC3'
    # pstring: 1 byte length + text; total bytes must be even (pad if 1+len is odd)
    compression_name = b'MACE 3-to-1'
    pstring = bytes([len(compression_name)]) + compression_name
    if len(pstring) % 2:
        pstring += b'\x00'
    
    comm_data = struct.pack('>hIh', num_channels, num_sample_frames, sample_size)
    comm_data += sample_rate_ext
    comm_data += compression_type
    comm_data += pstring
    
    comm_chunk = b'COMM' + struct.pack('>I', len(comm_data)) + comm_data
    if len(comm_chunk) % 2:
        comm_chunk += b'\x00'
    
    # SSND chunk
    ssnd_data = struct.pack('>II', 0, 0) + compressed_data
    ssnd_chunk = b'SSND' + struct.pack('>I', len(ssnd_data)) + ssnd_data
    if len(ssnd_chunk) % 2:
        ssnd_chunk += b'\x00'
    
    # FVER chunk (required for AIFF-C)
    fver_data = struct.pack('>I', 0xA2805140)
    fver_chunk = b'FVER' + struct.pack('>I', 4) + fver_data
    
    # Combine
    form_data = form_type + fver_chunk + comm_chunk + ssnd_chunk
    form_chunk = b'FORM' + struct.pack('>I', len(form_data)) + form_data
    
    return form_chunk

def main():
    # Extract Default Backgrounds
    extract_backgrounds(
        'Default Backgrounds',
        os.path.join(BASE_PATH, 'Default Backgrounds'),
        os.path.join(OUTPUT_PATH, 'backgrounds', 'default')
    )

    # Extract Pot Luck Backgrounds
    extract_backgrounds(
        'Pot Luck Backgrounds',
        os.path.join(BASE_PATH, 'Pot Luck Backgrounds'),
        os.path.join(OUTPUT_PATH, 'backgrounds', 'pot_luck')
    )
    
    # Extract Default Pieces
    extract_pieces(
        'Default Pieces',
        os.path.join(BASE_PATH, 'Default Pieces'),
        os.path.join(OUTPUT_PATH, 'pieces'),
        'default.png'
    )

    # Extract Diamond Pieces
    extract_pieces(
        'Diamond Pieces',
        os.path.join(BASE_PATH, 'Diamond Pieces'),
        os.path.join(OUTPUT_PATH, 'pieces'),
        'diamond.png'
    )
    
    # Extract Spherical Pieces
    extract_pieces(
        'Spherical Pieces',
        os.path.join(BASE_PATH, 'Spherical Pieces'),
        os.path.join(OUTPUT_PATH, 'pieces'),
        'spherical.png'
    )
    
    # Extract Animal Instinct Music
    extract_music(
        'Animal Instinct Music',
        os.path.join(BASE_PATH, 'Animal Instinct Music'),
        os.path.join(OUTPUT_PATH, 'music'),
        'animal_instinct',
    )

    # Extract Theme Music (Peter Wagner)
    extract_music(
        'Theme Music',
        os.path.join(BASE_PATH, 'Peter Wagner Music'),
        os.path.join(OUTPUT_PATH, 'music'),
        'peter_wagner',
    )
    print("\nDone!")

if __name__ == '__main__':
    main()
