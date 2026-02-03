#!/usr/bin/env python3
"""
Extract 'snd ' resources from Mac resource fork and convert to WAV files.
Mac 'snd ' format documentation: https://developer.apple.com/library/archive/documentation/mac/Sound/Sound-60.html
"""

import struct
import wave
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_PATH = os.path.join(SCRIPT_DIR, "../..", "Tetris Max PPC Project")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public")

def parse_resource_fork(filepath):
    """Parse a Mac resource fork and return all resources by type."""
    with open(filepath, 'rb') as f:
        data = f.read()
    
    # Resource fork header
    data_offset = struct.unpack('>I', data[0:4])[0]
    map_offset = struct.unpack('>I', data[4:8])[0]
    
    # Resource map
    type_list_offset = struct.unpack('>H', data[map_offset + 24:map_offset + 26])[0]
    name_list_offset = struct.unpack('>H', data[map_offset + 26:map_offset + 28])[0]
    num_types = struct.unpack('>H', data[map_offset + 28:map_offset + 30])[0] + 1
    
    resources = {}
    
    type_offset = map_offset + type_list_offset + 2
    for i in range(num_types):
        res_type = data[type_offset:type_offset + 4].decode('mac_roman', errors='replace')
        num_resources = struct.unpack('>H', data[type_offset + 4:type_offset + 6])[0] + 1
        ref_list_offset = struct.unpack('>H', data[type_offset + 6:type_offset + 8])[0]
        
        resources[res_type] = []
        
        ref_offset = map_offset + type_list_offset + ref_list_offset
        for j in range(num_resources):
            res_id = struct.unpack('>H', data[ref_offset:ref_offset + 2])[0]
            name_offset_rel = struct.unpack('>H', data[ref_offset + 2:ref_offset + 4])[0]
            attrs_data_offset = struct.unpack('>I', data[ref_offset + 4:ref_offset + 8])[0]
            res_data_offset = attrs_data_offset & 0x00FFFFFF
            
            # Get resource name
            name = ''
            if name_offset_rel != 0xFFFF:
                name_pos = map_offset + name_list_offset + name_offset_rel
                name_len = data[name_pos]
                name = data[name_pos + 1:name_pos + 1 + name_len].decode('mac_roman', errors='replace')
            
            # Get resource data
            res_size = struct.unpack('>I', data[data_offset + res_data_offset:data_offset + res_data_offset + 4])[0]
            res_data = data[data_offset + res_data_offset + 4:data_offset + res_data_offset + 4 + res_size]
            
            resources[res_type].append({
                'id': res_id,
                'name': name,
                'data': res_data
            })
            
            ref_offset += 12
        
        type_offset += 8
    
    return resources


def convert_snd_to_wav(snd_data, output_path):
    """Convert Mac 'snd ' resource to WAV file."""
    pos = 0
    
    # Read format type (1 or 2)
    format_type = struct.unpack('>H', snd_data[pos:pos+2])[0]
    pos += 2
    
    if format_type == 1:
        # Format 1: has data type count
        num_data_formats = struct.unpack('>H', snd_data[pos:pos+2])[0]
        pos += 2
        
        # Skip data format entries (6 bytes each)
        for i in range(num_data_formats):
            data_format_id = struct.unpack('>H', snd_data[pos:pos+2])[0]
            init_option = struct.unpack('>I', snd_data[pos+2:pos+6])[0]
            pos += 6
    elif format_type == 2:
        # Format 2: reference count
        ref_count = struct.unpack('>H', snd_data[pos:pos+2])[0]
        pos += 2
    else:
        print(f"  Unknown format type: {format_type}")
        return False
    
    # Number of sound commands
    num_commands = struct.unpack('>H', snd_data[pos:pos+2])[0]
    pos += 2
    
    # Find the sound data by looking for bufferCmd or soundCmd
    sample_rate = 22050  # Default
    sample_data = None
    
    for i in range(num_commands):
        cmd = struct.unpack('>H', snd_data[pos:pos+2])[0]
        param1 = struct.unpack('>H', snd_data[pos+2:pos+4])[0]
        param2 = struct.unpack('>I', snd_data[pos+4:pos+8])[0]
        pos += 8
        
        # bufferCmd (0x8051) or soundCmd (0x8050)
        if cmd in (0x8051, 0x8050):
            # param2 is offset to sound header from start of resource
            header_offset = param2
            
            # Parse sound header
            sample_ptr = struct.unpack('>I', snd_data[header_offset:header_offset+4])[0]
            num_samples = struct.unpack('>I', snd_data[header_offset+4:header_offset+8])[0]
            sample_rate_fixed = struct.unpack('>I', snd_data[header_offset+8:header_offset+12])[0]
            sample_rate = sample_rate_fixed >> 16  # Fixed point 16.16
            loop_start = struct.unpack('>I', snd_data[header_offset+12:header_offset+16])[0]
            loop_end = struct.unpack('>I', snd_data[header_offset+16:header_offset+20])[0]
            encoding = snd_data[header_offset+20]
            base_freq = snd_data[header_offset+21]
            
            # Check for extended or compressed header
            if encoding == 0xFF:
                # Extended sound header
                num_frames = struct.unpack('>I', snd_data[header_offset+22:header_offset+26])[0]
                # Skip AIFFSampleRate (10 bytes)
                # Skip markerChunk pointer (4 bytes)
                # Skip instrumentChunks pointer (4 bytes)
                # Skip AESRecording pointer (4 bytes)
                sample_size = struct.unpack('>H', snd_data[header_offset+48:header_offset+50])[0]
                # Sample data follows the header
                data_start = header_offset + 64
                sample_data = snd_data[data_start:data_start + num_samples * (sample_size // 8)]
                
                # Handle 16-bit samples
                if sample_size == 16:
                    # Convert big-endian to little-endian
                    samples = []
                    for j in range(0, len(sample_data), 2):
                        sample = struct.unpack('>h', sample_data[j:j+2])[0]
                        samples.append(struct.pack('<h', sample))
                    sample_data = b''.join(samples)
            elif encoding == 0xFE:
                # Compressed sound header - skip for now
                print(f"  Compressed audio not supported")
                return False
            else:
                # Standard sound header - 8-bit unsigned samples
                data_start = header_offset + 22
                sample_data = snd_data[data_start:data_start + num_samples]
                # 8-bit WAV uses unsigned samples (0-255), same as Mac format
                # No conversion needed!
            
            break
    
    if sample_data is None:
        print(f"  No sample data found")
        return False
    
    # Determine sample width
    if encoding == 0xFF and sample_size == 16:
        sampwidth = 2
    else:
        sampwidth = 1
    
    # Write WAV file
    with wave.open(output_path, 'wb') as wav:
        wav.setnchannels(1)  # Mono
        wav.setsampwidth(sampwidth)
        wav.setframerate(sample_rate)
        wav.writeframes(sample_data)
    
    return True


def main():
    # Paths
    rsrc_path = os.path.join(BASE_PATH, "Tetris Max 2011", "..namedfork", "rsrc")
    output_dir = os.path.join(OUTPUT_PATH, "sounds")
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Parse resource fork
    print("Parsing resource fork...")
    resources = parse_resource_fork(rsrc_path)
    
    if 'snd ' not in resources:
        print("No sound resources found!")
        return
    
    # Sound name mapping for cleaner filenames
    name_map = {
        'clear 1 row': 'clear1',
        'clear 2 rows': 'clear2',
        'clear 3 rows': 'clear3',
        'clear 4 rows': 'clear4',
        'drop piece': 'drop',
        'game over': 'gameover',
        'high score': 'highscore',
        'new level': 'newlevel',
        'pause': 'pause',
        'bonus1': 'smallBonus',
        'bonus2': 'bigBonus',
        'piece sticks': 'stick',
        'silence': 'silence',
        'registered': 'registered'
    }
    
    # Convert each sound
    print(f"\nConverting {len(resources['snd '])} sound resources...")
    for snd in resources['snd ']:
        name = snd['name']
        filename = name_map.get(name, name.replace(' ', '_'))
        output_path = os.path.join(output_dir, f'{filename}.wav')
        
        print(f"  Converting '{name}' -> {filename}.wav")
        try:
            if convert_snd_to_wav(snd['data'], output_path):
                print(f"    OK ({os.path.getsize(output_path)} bytes)")
            else:
                print(f"    FAILED")
        except Exception as e:
            print(f"    ERROR: {e}")
    
    print("\nDone!")


if __name__ == '__main__':
    main()
