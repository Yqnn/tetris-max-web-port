#!/usr/bin/env python3
"""
Extract score box frame images (PICT 260, 261, 262) from Tetris Max application.
Debug version with detailed opcode parsing.
"""

import struct
import os
import zlib

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_PATH = os.path.join(SCRIPT_DIR, "..", "Tetris Max PPC Project")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public")

def read_resource_fork(filepath):
    """Read the resource fork of a Mac file."""
    rsrc_path = filepath + "/..namedfork/rsrc"
    if os.path.exists(rsrc_path):
        with open(rsrc_path, 'rb') as f:
            return f.read()
    with open(filepath, 'rb') as f:
        return f.read()

def parse_resource_map(data):
    """Parse the resource fork and return a dictionary of resources."""
    if len(data) < 16:
        return {}
    
    data_offset = struct.unpack('>I', data[0:4])[0]
    map_offset = struct.unpack('>I', data[4:8])[0]
    
    resources = {}
    
    type_list_offset = map_offset + struct.unpack('>H', data[map_offset + 24:map_offset + 26])[0]
    num_types = struct.unpack('>H', data[type_list_offset:type_list_offset + 2])[0] + 1
    
    pos = type_list_offset + 2
    for i in range(num_types):
        res_type = data[pos:pos + 4].decode('mac_roman', errors='replace')
        num_resources = struct.unpack('>H', data[pos + 4:pos + 6])[0] + 1
        ref_list_offset = struct.unpack('>H', data[pos + 6:pos + 8])[0]
        
        ref_pos = type_list_offset + ref_list_offset
        for j in range(num_resources):
            res_id = struct.unpack('>h', data[ref_pos:ref_pos + 2])[0]
            attrs_and_offset = struct.unpack('>I', data[ref_pos + 4:ref_pos + 8])[0]
            res_data_offset = attrs_and_offset & 0x00FFFFFF
            
            actual_offset = data_offset + res_data_offset
            res_length = struct.unpack('>I', data[actual_offset:actual_offset + 4])[0]
            res_data = data[actual_offset + 4:actual_offset + 4 + res_length]
            
            if res_type not in resources:
                resources[res_type] = {}
            resources[res_type][res_id] = res_data
            
            ref_pos += 12
        
        pos += 8
    
    return resources

def hexdump(data, start, length=64):
    """Print hex dump for debugging."""
    for i in range(0, min(length, len(data) - start), 16):
        hex_str = ' '.join(f'{data[start + i + j]:02x}' for j in range(min(16, len(data) - start - i)))
        ascii_str = ''.join(chr(data[start + i + j]) if 32 <= data[start + i + j] < 127 else '.' 
                          for j in range(min(16, len(data) - start - i)))

def unpack_packbits(data, pos, expected_bytes):
    """Decompress PackBits data."""
    result = []
    start_pos = pos
    while len(result) < expected_bytes and pos < len(data):
        n = data[pos]
        pos += 1
        if n == 128:
            continue
        elif n > 128:
            count = 257 - n
            if pos < len(data):
                val = data[pos]
                pos += 1
                result.extend([val] * count)
        else:
            count = n + 1
            result.extend(data[pos:pos + count])
            pos += count
    return bytes(result[:expected_bytes]), pos

def decode_pict_v1(pict_data, pos, pict_id):
    """Decode a PICT v1 resource (1-byte opcodes, no alignment)."""
    pixels = None
    colors = None
    img_width = 0
    img_height = 0

    while pos < len(pict_data):
        opcode = pict_data[pos]
        pos += 1

        if opcode == 0x00:  # NOP
            pass
        elif opcode == 0x11:  # Version
            pos += 1
        elif opcode == 0x01:  # Clip
            region_size = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += region_size
        elif opcode == 0x02:  # BkPat
            pos += 8
        elif opcode == 0x03:  # TxFont
            pos += 2
        elif opcode == 0x04:  # TxFace
            pos += 1
        elif opcode == 0x05:  # TxMode
            pos += 2
        elif opcode == 0x06:  # SpExtra
            pos += 4
        elif opcode == 0x07:  # PnSize
            pos += 4
        elif opcode == 0x08:  # PnMode
            pos += 2
        elif opcode == 0x09:  # PnPat
            pos += 8
        elif opcode == 0x0A:  # FillPat
            pos += 8
        elif opcode == 0x0B:  # OvSize
            pos += 4
        elif opcode == 0x0C:  # Origin
            pos += 4
        elif opcode == 0x0D:  # TxSize
            pos += 2
        elif opcode == 0x0E:  # FgColor (v1: 4-byte QuickDraw color constant)
            pos += 4
        elif opcode == 0x0F:  # BkColor (v1: 4-byte QuickDraw color constant)
            pos += 4
        elif opcode == 0x10:  # TxRatio
            pos += 8
        elif opcode == 0x1E:  # DefHilite
            pass
        elif opcode == 0x20:  # Line
            pos += 8
        elif opcode == 0x21:  # LineFrom
            pos += 4
        elif opcode == 0x22:  # ShortLine
            pos += 6
        elif opcode == 0x23:  # ShortLineFrom
            pos += 2
        elif opcode == 0x28:  # LongText
            pos += 4
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif opcode == 0x29:  # DHText
            pos += 1
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif opcode == 0x2A:  # DVText
            pos += 1
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif opcode == 0x2B:  # DHDVText
            pos += 2
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif 0x30 <= opcode <= 0x37:  # frameRect, paintRect, etc.
            pos += 8
        elif 0x38 <= opcode <= 0x3F:  # frameSameRect, etc.
            pass
        elif 0x40 <= opcode <= 0x47:  # frameRRect, etc.
            pos += 8
        elif 0x48 <= opcode <= 0x4F:  # frameSameRRect, etc.
            pass
        elif 0x50 <= opcode <= 0x57:  # frameOval, etc.
            pos += 8
        elif 0x58 <= opcode <= 0x5F:  # frameSameOval, etc.
            pass
        elif 0x60 <= opcode <= 0x67:  # frameArc, etc.
            pos += 12
        elif 0x68 <= opcode <= 0x6F:  # frameSameArc, etc.
            pos += 4
        elif 0x70 <= opcode <= 0x77:  # framePoly, etc.
            poly_size = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += poly_size
        elif 0x78 <= opcode <= 0x7F:  # frameSamePoly, etc.
            pass
        elif 0x80 <= opcode <= 0x87:  # frameRgn, etc.
            rgn_size = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += rgn_size
        elif 0x88 <= opcode <= 0x8F:  # frameSameRgn, etc.
            pass
        elif opcode == 0x90:  # BitsRect (v1: uncompressed 1-bit bitmap)
            result = decode_bits_rect(pict_data, pos, pict_id)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x91:  # BitsRgn
            result = decode_bits_rect(pict_data, pos, pict_id, has_region=True)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x98:  # PackBitsRect (v1: PackBits-compressed 1-bit bitmap)
            result = decode_packbits_rect_v1(pict_data, pos, pict_id)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x99:  # PackBitsRgn
            result = decode_packbits_rect_v1(pict_data, pos, pict_id, has_region=True)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0xFF:  # EndPic
            break
        else:
            break

    return pixels, colors, img_width, img_height


def decode_packbits_rect_v1(data, pos, pict_id, has_region=False):
    """Decode PICT v1 PackBitsRect: PackBits-compressed 1-bit bitmap."""
    rowbytes = struct.unpack('>H', data[pos:pos+2])[0]
    bounds_top = struct.unpack('>h', data[pos+2:pos+4])[0]
    bounds_left = struct.unpack('>h', data[pos+4:pos+6])[0]
    bounds_bottom = struct.unpack('>h', data[pos+6:pos+8])[0]
    bounds_right = struct.unpack('>h', data[pos+8:pos+10])[0]
    pos += 10

    width = bounds_right - bounds_left
    height = bounds_bottom - bounds_top

    # srcRect, dstRect, mode
    pos += 8 + 8 + 2

    if has_region:
        rgn_size = struct.unpack('>H', data[pos:pos+2])[0]
        pos += rgn_size

    pixels = []
    colors = [(255, 255, 255), (0, 0, 0)]
    use_2byte_len = rowbytes > 250

    for row in range(height):
        if use_2byte_len:
            row_len = struct.unpack('>H', data[pos:pos+2])[0]
            pos += 2
        else:
            row_len = data[pos]
            pos += 1

        row_data, _ = unpack_packbits(data, pos, rowbytes)
        pos += row_len

        row_pixels = []
        for x in range(width):
            byte_idx = x // 8
            bit_idx = 7 - (x % 8)
            if byte_idx < len(row_data):
                pixel = (row_data[byte_idx] >> bit_idx) & 1
                row_pixels.append(pixel)
            else:
                row_pixels.append(0)
        pixels.append(row_pixels)

    return pixels, colors, width, height, pos


def decode_pict(pict_data, pict_id):
    """Decode a PICT resource with detailed opcode parsing."""

    pos = 0
    # Size word (may not be accurate for v2)
    size = struct.unpack('>H', pict_data[pos:pos+2])[0]
    pos += 2

    # Frame rectangle
    frame_top = struct.unpack('>h', pict_data[pos:pos+2])[0]
    frame_left = struct.unpack('>h', pict_data[pos+2:pos+4])[0]
    frame_bottom = struct.unpack('>h', pict_data[pos+4:pos+6])[0]
    frame_right = struct.unpack('>h', pict_data[pos+6:pos+8])[0]
    pos += 8

    width = frame_right - frame_left
    height = frame_bottom - frame_top

    # Detect PICT version: v1 starts with opcode byte 0x11 (picVersion)
    if pos < len(pict_data) and pict_data[pos] == 0x11:
        return decode_pict_v1(pict_data, pos, pict_id)

    pixels = None
    colors = None
    img_width = width
    img_height = height

    # Parse opcodes (PICT v2: 2-byte opcodes, word-aligned)
    while pos < len(pict_data) - 2:
        # Align to word boundary for v2
        if pos % 2 == 1:
            pos += 1
        
        opcode = struct.unpack('>H', pict_data[pos:pos+2])[0]
        pos += 2
            
        if opcode == 0x0000:  # NOP
            pass
        elif opcode == 0x0011:  # VersionOp
            version = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += 2
        elif opcode == 0x1101:  # VersionOp + version (misaligned/alternate encoding)
            pos += 2
        elif opcode == 0x0C00:  # HeaderOp (v2 extended header)
            # 24 bytes of header data
            header_version = struct.unpack('>h', pict_data[pos:pos+2])[0]
            pos += 24
        elif opcode == 0x0A00:  # Alternate/extended header (e.g. PICT 137), 8 bytes
            pos += 8
        elif opcode == 0x001E:  # DefHilite
            pass
        elif opcode == 0x0001:  # Clip region
            region_size = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += region_size
        elif opcode == 0x003C and pos >= 2 and pos + 12 <= len(pict_data):
            # PICT 137: 0x003C at 24 is rowBytes (60); BitsRect+PackBits data at pos-2
            result = decode_bits_rect_packbits(pict_data, pos - 2, pict_id)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode in (0x0098, 0x9800):  # PackBitsRect or BitsRect+PackBits (PICT 137)
            result = None
            if opcode == 0x9800 and pos >= 3 and pos + 28 < len(pict_data):
                # PICT 137: 0x98 was single byte, data starts at pos-1 (after 0x98)
                result = decode_bits_rect_packbits(pict_data, pos - 1, pict_id)
                if result:
                    pixels, colors, img_width, img_height, pos = result
            if result is None or not pixels:
                result = decode_packbits_rect(pict_data, pos, pict_id)
                if result:
                    pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x0099:  # PackBitsRgn
            result = decode_packbits_rect(pict_data, pos, pict_id, has_region=True)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x009A:  # DirectBitsRect
            result = decode_direct_bits_rect(pict_data, pos, pict_id)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x009B:  # DirectBitsRgn
            result = decode_direct_bits_rect(pict_data, pos, pict_id, has_region=True)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x00FF:  # OpEndPic
            break
        elif opcode == 0x0002:  # BkPat
            pos += 8
        elif opcode == 0x0003:  # TxFont
            pos += 2
        elif opcode == 0x0004:  # TxFace
            pos += 1
        elif opcode == 0x0005:  # TxMode
            pos += 2
        elif opcode == 0x0006:  # SpExtra
            pos += 4
        elif opcode == 0x0007:  # PnSize
            pos += 4
        elif opcode == 0x0008:  # PnMode
            pos += 2
        elif opcode == 0x0009:  # PnPat
            pos += 8
        elif opcode == 0x000A:  # FillPat
            pos += 8
        elif opcode == 0x000B:  # OvSize
            pos += 4
        elif opcode == 0x000C:  # Origin
            pos += 4
        elif opcode == 0x000D:  # TxSize
            pos += 2
        elif opcode == 0x000E:  # FgColor
            pos += 4
        elif opcode == 0x000F:  # BkColor
            pos += 4
        elif opcode == 0x0010:  # TxRatio
            pos += 8
        elif opcode == 0x0012:  # BkPixPat
            pos = skip_pixpat(pict_data, pos)
        elif opcode == 0x0013:  # PnPixPat
            pos = skip_pixpat(pict_data, pos)
        elif opcode == 0x0014:  # FillPixPat
            pos = skip_pixpat(pict_data, pos)
        elif opcode == 0x0015:  # PnLocHFrac
            pos += 2
        elif opcode == 0x0016:  # ChExtra
            pos += 2
        elif opcode == 0x001A:  # RGBFgCol
            pos += 6
        elif opcode == 0x001B:  # RGBBkCol
            pos += 6
        elif opcode == 0x001C:  # HiliteMode
            pass
        elif opcode == 0x001D:  # HiliteColor
            pos += 6
        elif opcode == 0x001F:  # OpColor
            pos += 6
        elif opcode == 0x0020:  # Line
            pos += 8
        elif opcode == 0x0021:  # LineFrom
            pos += 4
        elif opcode == 0x0022:  # ShortLine
            pos += 6
        elif opcode == 0x0023:  # ShortLineFrom
            pos += 2
        elif opcode == 0x0028:  # LongText
            pos += 4  # point
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif opcode == 0x0029:  # DHText
            pos += 1  # dh
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif opcode == 0x002A:  # DVText
            pos += 1  # dv
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif opcode == 0x002B:  # DHDVText
            pos += 2  # dh, dv
            text_len = pict_data[pos]
            pos += 1 + text_len
        elif opcode == 0x002C:  # fontName
            data_len = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += data_len
        elif opcode == 0x002E:  # glyphState
            data_len = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += data_len
        elif 0x0030 <= opcode <= 0x0037:  # frameRect, paintRect, etc.
            pos += 8
        elif 0x0038 <= opcode <= 0x003F:  # frameSameRect, etc.
            pass
        elif 0x0040 <= opcode <= 0x0047:  # frameRRect, etc.
            pos += 8
        elif 0x0048 <= opcode <= 0x004F:  # frameSameRRect, etc.
            pass
        elif 0x0050 <= opcode <= 0x0057:  # frameOval, etc.
            pos += 8
        elif 0x0058 <= opcode <= 0x005F:  # frameSameOval, etc.
            pass
        elif 0x0060 <= opcode <= 0x0067:  # frameArc, etc.
            pos += 12
        elif 0x0068 <= opcode <= 0x006F:  # frameSameArc, etc.
            pos += 4
        elif 0x0070 <= opcode <= 0x0077:  # framePoly, etc.
            poly_size = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += poly_size
        elif 0x0078 <= opcode <= 0x007F:  # frameSamePoly, etc.
            pass
        elif 0x0080 <= opcode <= 0x0087:  # frameRgn, etc.
            rgn_size = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += rgn_size
        elif 0x0088 <= opcode <= 0x008F:  # frameSameRgn, etc.
            pass
        elif opcode == 0x0090:  # BitsRect
            result = decode_bits_rect(pict_data, pos, pict_id)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x0091:  # BitsRgn
            result = decode_bits_rect(pict_data, pos, pict_id, has_region=True)
            if result:
                pixels, colors, img_width, img_height, pos = result
        elif opcode == 0x00A0:  # ShortComment
            pos += 2
        elif opcode == 0x00A1:  # LongComment
            pos += 2  # kind
            data_len = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += 2 + data_len
        elif 0x00A2 <= opcode <= 0x00AF:
            data_len = struct.unpack('>H', pict_data[pos:pos+2])[0]
            pos += 2 + data_len
        elif 0x00B0 <= opcode <= 0x00CF:
            pass  # Reserved, no data
        elif 0x00D0 <= opcode <= 0x00FE:
            data_len = struct.unpack('>I', pict_data[pos:pos+4])[0]
            pos += 4 + data_len
        elif 0x8000 <= opcode <= 0x80FF:
            pass  # Reserved, no data
        elif 0x8100 <= opcode <= 0xFFFF:
            data_len = struct.unpack('>I', pict_data[pos:pos+4])[0]
            pos += 4 + data_len
        else:
            hexdump(pict_data, pos - 2, 32)
            break
    
    return pixels, colors, img_width, img_height

def skip_pixpat(data, pos):
    """Skip a PixPat structure."""
    pat_type = struct.unpack('>H', data[pos:pos+2])[0]
    pos += 2
    pos += 8  # pat1Data
    pos += 6  # RGB
    if pat_type == 1:
        # Indexed PixPat
        pos = skip_pixmap(data, pos)
        # Skip color table and pixel data
        ct_size = struct.unpack('>H', data[pos + 6:pos + 8])[0]
        pos += 8 + (ct_size + 1) * 8
        # Pixel data follows...
        # This is complex, simplified skip
        pos += 100
    elif pat_type == 2:
        # RGB PixPat
        pos += 6  # RGB
    return pos

def skip_pixmap(data, pos):
    """Skip a PixMap structure."""
    return pos + 50  # Simplified

def decode_bits_rect(data, pos, pict_id, has_region=False):
    """Decode BitsRect (1-bit bitmap)."""
    # BitMap: rowBytes(2), bounds(8)
    rowbytes = struct.unpack('>H', data[pos:pos+2])[0]
    bounds_top = struct.unpack('>h', data[pos+2:pos+4])[0]
    bounds_left = struct.unpack('>h', data[pos+4:pos+6])[0]
    bounds_bottom = struct.unpack('>h', data[pos+6:pos+8])[0]
    bounds_right = struct.unpack('>h', data[pos+8:pos+10])[0]
    pos += 10
    
    width = bounds_right - bounds_left
    height = bounds_bottom - bounds_top
    
    # srcRect, dstRect, mode
    pos += 8 + 8 + 2
    
    if has_region:
        rgn_size = struct.unpack('>H', data[pos:pos+2])[0]
        pos += rgn_size
    
    # Read bitmap data
    pixels = []
    colors = [(255, 255, 255), (0, 0, 0)]  # 1-bit: white and black
    
    for row in range(height):
        row_data = data[pos:pos + rowbytes]
        pos += rowbytes
        row_pixels = []
        for x in range(width):
            byte_idx = x // 8
            bit_idx = 7 - (x % 8)
            if byte_idx < len(row_data):
                pixel = (row_data[byte_idx] >> bit_idx) & 1
                row_pixels.append(pixel)
            else:
                row_pixels.append(0)
        pixels.append(row_pixels)
    
    return pixels, colors, width, height, pos

def decode_bits_rect_packbits(data, pos, pict_id):
    """Decode BitsRect with PackBits-compressed rows (e.g. PICT 137)."""
    rowbytes_be = struct.unpack('>H', data[pos:pos+2])[0]
    # PICT 137 stores rowBytes as 60 (0x003c); big-endian 3c 00 = 0x3c00, so try LE
    rowbytes = struct.unpack('<H', data[pos:pos+2])[0] if rowbytes_be > 1000 else rowbytes_be
    bounds_top = struct.unpack('>h', data[pos+2:pos+4])[0]
    bounds_left = struct.unpack('>h', data[pos+4:pos+6])[0]
    bounds_bottom = struct.unpack('>h', data[pos+6:pos+8])[0]
    bounds_right = struct.unpack('>h', data[pos+8:pos+10])[0]
    pos += 10
    width = bounds_right - bounds_left
    height = bounds_bottom - bounds_top
    if rowbytes <= 0 or width <= 0 or height <= 0:
        return None
    # PICT 137 may omit srcRect/dstRect/mode; try no skip first
    skip = 0
    if pos + 18 <= len(data):
        # Check if next 8 bytes look like a rect (same bounds)
        r2 = struct.unpack('>hhhh', data[pos:pos+8])
        if r2 == (bounds_top, bounds_left, bounds_bottom, bounds_right):
            skip = 18  # srcRect(8) + dstRect(8) + mode(2)
    pos += skip
    pixels = []
    colors = [(255, 255, 255), (0, 0, 0)]
    for row in range(height):
        if pos >= len(data):
            break
        row_len = data[pos]
        pos += 1
        if row_len > 255 or pos + row_len > len(data):
            break
        row_data, _ = unpack_packbits(data, pos, rowbytes)
        pos += row_len
        row_pixels = []
        for x in range(width):
            byte_idx = x // 8
            bit_idx = 7 - (x % 8)
            if byte_idx < len(row_data):
                pixel = (row_data[byte_idx] >> bit_idx) & 1
                row_pixels.append(pixel)
            else:
                row_pixels.append(0)
        pixels.append(row_pixels)
    if len(pixels) != height:
        return None
    return pixels, colors, width, height, pos

def decode_packbits_rect(data, pos, pict_id, has_region=False):
    """Decode PackBitsRect (indexed color with PackBits compression)."""
    start_pos = pos
    
    # Check for PixMap flag
    rowbytes_raw = struct.unpack('>H', data[pos:pos+2])[0]
    is_pixmap = (rowbytes_raw & 0x8000) != 0
    rowbytes = rowbytes_raw & 0x3FFF
    
    if not is_pixmap:
        print(f"      Not a PixMap (rowbytes=0x{rowbytes_raw:04X})")
        return None
    
    # PixMap structure
    bounds_top = struct.unpack('>h', data[pos+2:pos+4])[0]
    bounds_left = struct.unpack('>h', data[pos+4:pos+6])[0]
    bounds_bottom = struct.unpack('>h', data[pos+6:pos+8])[0]
    bounds_right = struct.unpack('>h', data[pos+8:pos+10])[0]
    pos += 10
    
    pm_version = struct.unpack('>H', data[pos:pos+2])[0]
    pack_type = struct.unpack('>H', data[pos+2:pos+4])[0]
    pack_size = struct.unpack('>I', data[pos+4:pos+8])[0]
    h_res = struct.unpack('>I', data[pos+8:pos+12])[0]
    v_res = struct.unpack('>I', data[pos+12:pos+16])[0]
    pixel_type = struct.unpack('>H', data[pos+16:pos+18])[0]
    pixel_size = struct.unpack('>H', data[pos+18:pos+20])[0]
    cmp_count = struct.unpack('>H', data[pos+20:pos+22])[0]
    cmp_size = struct.unpack('>H', data[pos+22:pos+24])[0]
    plane_bytes = struct.unpack('>I', data[pos+24:pos+28])[0]
    pm_table = struct.unpack('>I', data[pos+28:pos+32])[0]
    pm_reserved = struct.unpack('>I', data[pos+32:pos+36])[0]
    pos += 36
    
    width = bounds_right - bounds_left
    height = bounds_bottom - bounds_top
    
    # Color table
    ct_seed = struct.unpack('>I', data[pos:pos+4])[0]
    ct_flags = struct.unpack('>H', data[pos+4:pos+6])[0]
    ct_size = struct.unpack('>H', data[pos+6:pos+8])[0]
    pos += 8
    
    num_colors = ct_size + 1
    colors = [(0, 0, 0)] * 256
    
    
    for i in range(num_colors):
        idx = struct.unpack('>H', data[pos:pos+2])[0]
        r = struct.unpack('>H', data[pos+2:pos+4])[0]
        g = struct.unpack('>H', data[pos+4:pos+6])[0]
        b = struct.unpack('>H', data[pos+6:pos+8])[0]
        pos += 8
        
        # Use entry number as index when device table flag is set
        actual_idx = i if (ct_flags & 0x8000) else idx
        if actual_idx < 256:
            colors[actual_idx] = (r >> 8, g >> 8, b >> 8)
    
    # srcRect, dstRect, mode
    pos += 8 + 8 + 2
    
    if has_region:
        rgn_size = struct.unpack('>H', data[pos:pos+2])[0]
        pos += rgn_size
    
    # Decompress pixel data
    pixels = []
    use_2byte_len = rowbytes > 250
    
    for row in range(height):
        if use_2byte_len:
            row_len = struct.unpack('>H', data[pos:pos+2])[0]
            pos += 2
        else:
            row_len = data[pos]
            pos += 1
        
        row_data, _ = unpack_packbits(data, pos, rowbytes)
        pos += row_len
        
        # Convert to indexed pixels
        row_pixels = []
        if pixel_size == 8:
            for x in range(width):
                idx = row_data[x] if x < len(row_data) else 0
                row_pixels.append(idx)
        elif pixel_size == 4:
            for x in range(width):
                byte_idx = x // 2
                if byte_idx < len(row_data):
                    byte_val = row_data[byte_idx]
                    if x % 2 == 0:
                        idx = (byte_val >> 4) & 0x0F
                    else:
                        idx = byte_val & 0x0F
                    row_pixels.append(idx)
                else:
                    row_pixels.append(0)
        elif pixel_size == 2:
            for x in range(width):
                byte_idx = x // 4
                if byte_idx < len(row_data):
                    byte_val = row_data[byte_idx]
                    shift = 6 - (x % 4) * 2
                    idx = (byte_val >> shift) & 0x03
                    row_pixels.append(idx)
                else:
                    row_pixels.append(0)
        elif pixel_size == 1:
            for x in range(width):
                byte_idx = x // 8
                if byte_idx < len(row_data):
                    byte_val = row_data[byte_idx]
                    bit_idx = 7 - (x % 8)
                    idx = (byte_val >> bit_idx) & 0x01
                    row_pixels.append(idx)
                else:
                    row_pixels.append(0)
        
        pixels.append(row_pixels)
    
    return pixels, colors, width, height, pos

def decode_direct_bits_rect(data, pos, pict_id, has_region=False):
    """Decode DirectBitsRect (direct color)."""
    # baseAddr (ignored for PICT)
    pos += 4
    
    # PixMap structure
    rowbytes_raw = struct.unpack('>H', data[pos:pos+2])[0]
    rowbytes = rowbytes_raw & 0x3FFF
    bounds_top = struct.unpack('>h', data[pos+2:pos+4])[0]
    bounds_left = struct.unpack('>h', data[pos+4:pos+6])[0]
    bounds_bottom = struct.unpack('>h', data[pos+6:pos+8])[0]
    bounds_right = struct.unpack('>h', data[pos+8:pos+10])[0]
    pos += 10
    
    pm_version = struct.unpack('>H', data[pos:pos+2])[0]
    pack_type = struct.unpack('>H', data[pos+2:pos+4])[0]
    pack_size = struct.unpack('>I', data[pos+4:pos+8])[0]
    h_res = struct.unpack('>I', data[pos+8:pos+12])[0]
    v_res = struct.unpack('>I', data[pos+12:pos+16])[0]
    pixel_type = struct.unpack('>H', data[pos+16:pos+18])[0]
    pixel_size = struct.unpack('>H', data[pos+18:pos+20])[0]
    cmp_count = struct.unpack('>H', data[pos+20:pos+22])[0]
    cmp_size = struct.unpack('>H', data[pos+22:pos+24])[0]
    plane_bytes = struct.unpack('>I', data[pos+24:pos+28])[0]
    pm_table = struct.unpack('>I', data[pos+28:pos+32])[0]
    pm_reserved = struct.unpack('>I', data[pos+32:pos+36])[0]
    pos += 36
    
    width = bounds_right - bounds_left
    height = bounds_bottom - bounds_top
    
    # srcRect, dstRect, mode
    pos += 8 + 8 + 2
    
    if has_region:
        rgn_size = struct.unpack('>H', data[pos:pos+2])[0]
        pos += rgn_size
    
    # Decompress pixel data
    pixels = []
    colors = None  # Direct color doesn't use a palette
    use_2byte_len = rowbytes > 250
    
    for row in range(height):
        if use_2byte_len:
            row_len = struct.unpack('>H', data[pos:pos+2])[0]
            pos += 2
        else:
            row_len = data[pos]
            pos += 1
        
        if pack_type == 0 or pack_type == 1:
            # No compression or default
            row_data = data[pos:pos + row_len]
            pos += row_len
        else:
            # PackBits compression
            row_data, _ = unpack_packbits(data, pos, rowbytes)
            pos += row_len
        
        row_pixels = []
        if pixel_size == 32:
            for x in range(width):
                idx = x * 4
                if idx + 3 < len(row_data):
                    # ARGB or xRGB
                    row_pixels.append((row_data[idx+1], row_data[idx+2], row_data[idx+3]))
                else:
                    row_pixels.append((0, 0, 0))
        elif pixel_size == 16:
            for x in range(width):
                idx = x * 2
                if idx + 1 < len(row_data):
                    val = (row_data[idx] << 8) | row_data[idx+1]
                    r = ((val >> 10) & 0x1F) << 3
                    g = ((val >> 5) & 0x1F) << 3
                    b = (val & 0x1F) << 3
                    row_pixels.append((r, g, b))
                else:
                    row_pixels.append((0, 0, 0))
        
        pixels.append(row_pixels)
    
    return pixels, colors, width, height, pos

def save_png_indexed(filename, width, height, pixels, colors):
    """Save as indexed PNG."""
    def png_chunk(chunk_type, chunk_data):
        chunk_len = struct.pack('>I', len(chunk_data))
        chunk_crc = zlib.crc32(chunk_type + chunk_data) & 0xffffffff
        return chunk_len + chunk_type + chunk_data + struct.pack('>I', chunk_crc)
    
    with open(filename, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 3, 0, 0, 0)))
        
        plte_data = b''.join(bytes([r, g, b]) for r, g, b in colors)
        f.write(png_chunk(b'PLTE', plte_data))
        
        raw_data = b''
        for row in pixels:
            raw_data += b'\x00' + bytes(row[:width])
        
        f.write(png_chunk(b'IDAT', zlib.compress(raw_data, 9)))
        f.write(png_chunk(b'IEND', b''))
    
    print(f"Saved: {filename}")

def main():
    app_path = os.path.join(BASE_PATH, "Tetris Max 2011")
    output_dir = os.path.join(OUTPUT_PATH, "sprites")

    data = read_resource_fork(app_path)

    resources = parse_resource_map(data)

    if 'PICT' not in resources:
        print("No PICT resources found!")
        return

    print(f"Found PICT resources: {sorted(resources['PICT'].keys())}")

    # Known names for identified assets
    pict_names = {
        128: "popup_triangle.png",
        129: "about.png",
        130: "default_pieces.png",
        131: "turn_clockwise.png",
        132: "arrow_left.png",
        133: "arrow_down.png",
        134: "arrow_right.png",
        135: "default_pieces_bw.png",
        136: "ruler.png",
        137: "about_bw.png",
        138: "gameover_bw.png",
        139: "paused_bw.png",
        140: "welcome_bw.png",
        141: "frame_bw.png",
        142: "t_piece_bw.png",
        143: "turn_counterclockwise.png",
        144: "turn_clockwise_bw.png",
        145: "arrow_down_dashed.png",
        146: "t_piece.png",
        148: "shareware_notice.png",
        149: "shareware_notice_bw.png",
        150: "default_pieces_lg.png",
        151: "welcome_lg.png",
        152: "gameover_lg.png",
        153: "pause_lg.png",
        256: "gameover.png",
        257: "pause.png",
        258: "welcome.png",
        259: "highscores.png",
        260: "score_frame.png",
        261: "level_frame.png",
        262: "rows_frame.png",
        280: "highscores_bw.png",
        300: "turn_counterclockwise_bw.png",
    }

    for pict_id in sorted(resources['PICT'].keys()):
        pict_data = resources['PICT'][pict_id]
        pixels, colors, width, height = decode_pict(pict_data, pict_id)

        if pixels:
            filename = pict_names.get(pict_id, f"pict_{pict_id}.png")
            output_path = os.path.join(output_dir, filename)
            save_png_indexed(output_path, width, height, pixels, colors)
        else:
            print(f"Failed to decode PICT {pict_id}")

if __name__ == "__main__":
    main()
